import type { Job, Platform, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { check } from "@/lib/errors";
import { profileIdentity, publicUrl } from "@/lib/urls";
import { audit, lock } from "./audit";
import { providers } from "./providers";
import type { Profile, ProviderStatus } from "./providers/types";
import { enqueue } from "./jobs";

export const platforms = ["INSTAGRAM", "YOUTUBE", "TIKTOK", "NAVER_BLOG"] as const;
export const manualSchema = z.object({
  platform: z.enum(platforms), url: z.string().min(1).max(2048), name: z.string().trim().min(1).max(160),
  bio: z.string().trim().max(2000).optional(), country: z.string().trim().max(80).optional(), region: z.string().trim().max(80).optional(),
  link: z.string().trim().max(2048).optional(), existingCreatorId: z.uuid().optional(), linkEvidence: z.string().trim().max(2048).optional(),
});
export const discoverySchema = z.object({
  platforms: z.array(z.enum(platforms)).min(1).max(4),
  query: z.string().trim().min(1).max(150),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
});
export async function registerProfile(input: z.infer<typeof manualSchema>, actorId: string) {
  const { platform, existingCreatorId } = input;
  const identity = profileIdentity(platform, input.url);
  const evidence = input.linkEvidence ? publicUrl(input.linkEvidence) : null;
  const link = input.link ? publicUrl(input.link) : null;
  check(!input.link || link, "외부 링크는 공개 HTTPS 주소여야 합니다.");
  check(!existingCreatorId || evidence, "기존 크리에이터에 계정을 연결하려면 공개 확인 근거가 필요합니다.");
  return db.$transaction(async (tx) => {
    await lock(tx, "collection:" + platform);
    const duplicate = await tx.creatorPlatformAccount.findFirst({ where: { platform, OR: [{ profileUrl: identity.profileUrl }, ...(identity.externalId ? [{ externalId: identity.externalId }] : []), { handle: { equals: identity.handle, mode: "insensitive" } }] } });
    check(!duplicate, "이미 등록한 SNS 계정입니다.", 409);
    const account = await tx.creatorPlatformAccount.create({
      data: { ...identity, platform, source: "MANUAL", bio: input.bio || null, links: link ? [link.href] : [], collectedAt: new Date(),
        creator: existingCreatorId ? { connect: { id: existingCreatorId } } :
          { create: { name: input.name, country: input.country || null, region: input.region || null } },
      },
    });
    await audit(tx, actorId, "PROFILE_REGISTER", account.id, evidence ? { linkEvidence: evidence.href } : undefined);
    await enqueue(tx, "SUBSCRIPTIONS", { accountId: account.id }, actorId);
    return account;
  });
}
async function saveProfile(profile: Profile, knownAccountId?: string) {
  const collectedAt = new Date();
  const expiresAt = profile.platform === "YOUTUBE" ? new Date(collectedAt.getTime() + 29 * 86400000) : null;
  const links = (profile.links ?? []).map((item) => publicUrl(item)?.href).filter((item): item is string => Boolean(item));
  const avatarUrl = profile.avatarUrl ? publicUrl(profile.avatarUrl)?.href : undefined;
  return db.$transaction(async (tx) => {
    await lock(tx, "collection:" + profile.platform);
    const matches = await tx.creatorPlatformAccount.findMany({ where: { platform: profile.platform,
      OR: [{ profileUrl: profile.profileUrl }, ...(profile.externalId ? [{ externalId: profile.externalId }] : []), { handle: { equals: profile.handle, mode: "insensitive" } }, ...(knownAccountId ? [{ id: knownAccountId }] : [])] } });
    check(matches.length <= 1, "공급자 식별자가 기존 여러 계정과 충돌합니다.", 409);
    const current = matches[0];
    if (knownAccountId) check(current?.id === knownAccountId, "갱신 대상이 삭제되었습니다.", 409);
    check(!current?.externalId || !profile.externalId || current.externalId === profile.externalId,
      "프로필이 다른 공급자 계정에 연결되었습니다. 계정 식별자를 확인하세요.", 409);
    let reviewed = false;
    if (current) {
      await lock(tx, "dm:" + current.creatorId);
      const latest = await tx.creator.findUniqueOrThrow({ where: { id: current.creatorId } });
      if (latest.reviewStatus === "HOLD" || latest.adultStatus === "EXCLUDED") return false;
      reviewed = latest.reviewStatus === "CLEARED" && latest.adultStatus === "VERIFIED";
    }
    const lastActiveAt = profile.contents?.reduce<Date | undefined>((date, item) => item.publishedAt && (!date || item.publishedAt > date) ? item.publishedAt : date, undefined);
    const data = { handle: profile.handle, profileUrl: profile.profileUrl, externalId: profile.externalId,
      avatarUrl: avatarUrl ?? null, followers: profile.followers ?? null,
      lastActiveAt: profile.contents ? lastActiveAt ?? null : undefined,
      collectedAt, expiresAt, bio: profile.bio?.slice(0, 2000) ?? null, links,
    };
    const account = current ? await tx.creatorPlatformAccount.update({ where: { id: current.id },
      data: { ...data, ...(current.source === "MANUAL" ? { bio: current.bio, links: current.links } : {}) } }) :
      await tx.creatorPlatformAccount.create({ data: { ...data, platform: profile.platform, source: "OFFICIAL_API", creator: { create: { name: profile.name.slice(0, 160), country: profile.country } } } });
    for (const content of reviewed ? profile.contents ?? [] : []) {
      const url = publicUrl(content.url);
      if (!url) continue;
      const where = { accountId_url: { accountId: account.id, url: url.href } };
      const previous = await tx.creatorContent.findUnique({ where, select: { source: true } });
      const metadata = { title: content.title?.slice(0, 240), publishedAt: content.publishedAt, collectedAt };
      await tx.creatorContent.upsert({ where, update: previous?.source === "OFFICIAL_API" ? metadata : {}, create: {
        ...metadata, accountId: account.id, source: "OFFICIAL_API", url: url.href, externalId: content.externalId,
      } });
    }
    if (profile.followers !== undefined) {
      const dayStart = new Date(collectedAt.toISOString().slice(0, 10));
      const snapshot = await tx.creatorMetricSnapshot.findFirst({ where: { accountId: account.id, capturedAt: { gte: dayStart } } });
      if (!snapshot) await tx.creatorMetricSnapshot.create({ data: { accountId: account.id, followers: profile.followers } });
    }
    if (profile.platform !== "YOUTUBE") {
      await enqueue(tx, "SUBSCRIPTIONS", { accountId: account.id });
      await enqueue(tx, "METRICS", { creatorId: account.creatorId });
    }
    return true;
  });
}

function transient(status: ProviderStatus) { return status === "UNAVAILABLE" || status === "RATE_LIMITED"; }
export class RetryJob extends Error {}
export async function collect(job: Job, updateProgress: (value: number) => Promise<void>): Promise<Prisma.InputJsonObject> {
  if (job.type !== "DISCOVERY") {
    const { accountId } = z.object({ accountId: z.uuid() }).parse(job.payload);
    const account = await db.creatorPlatformAccount.findUniqueOrThrow({ where: { id: accountId }, include: { creator: true } });
    check(account.creator.reviewStatus !== "HOLD" && account.creator.adultStatus !== "EXCLUDED", "검토 보류 중인 계정입니다.");
    const result = await providers[account.platform].refreshCreator(account.profileUrl);
    await db.providerRequestLog.create({ data: { platform: account.platform, operation: job.type, status: result.status, jobId: job.id } });
    if (transient(result.status)) throw new RetryJob(result.reason);
    const count = result.data && await saveProfile(result.data, account.id) ? 1 : 0;
    return { status: result.status, count, reason: result.reason ?? null };
  }
  const input = discoverySchema.parse(job.payload);
  const platforms = [...new Set(input.platforms)];
  const summary: { platform: Platform; status: ProviderStatus; count: number; reason: string | null }[] = [];
  for (const platform of platforms) {
    const result = await providers[platform].searchCreators(input);
    let count = 0;
    for (const profile of result.data ?? []) {
      if (await saveProfile(profile)) count++;
    }
    await db.providerRequestLog.create({ data: { platform, operation: "DISCOVERY", status: result.status, count, jobId: job.id } });
    summary.push({ platform, status: result.status, count, reason: result.reason ?? null });
    await updateProgress(Math.round(100 * summary.length / platforms.length));
  }
  if (summary.length === 1 && transient(summary[0].status)) throw new RetryJob(summary[0].reason ?? undefined);
  return { providers: summary, count: summary.reduce((sum, result) => sum + result.count, 0) };
}
