import { AdultStatus, Prisma, RecruitmentStage, ReviewStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { check } from "@/lib/errors";
import { publicUrl } from "@/lib/urls";
import { audit, lock } from "./audit";
import { discoverySchema, manualSchema, platforms, registerProfile } from "./collection";
import { filtersSchema } from "./directory";
import { cancelJob, enqueue } from "./jobs";
import { recordDM } from "./dm";
import { correspondentUsername, disconnectInstagram } from "./instagram";
import { weightKeys, weightsSchema } from "./scoring";

const id = z.uuid();
const shortText = z.string().trim().min(1).max(120);
const note = z.string().trim().min(1).max(2000);
function link(value: string) { const url = publicUrl(value); check(url, "공개 HTTPS 주소를 입력하세요."); return url.href; }
const schemas = {
  profile: manualSchema,
  discovery: discoverySchema,
  preset: z.object({ name: shortText, filters: filtersSchema }),
  presetDelete: z.object({ id }),
  job: z.object({ id, type: z.enum(["REFRESH", "SUBSCRIPTIONS", "ANALYSIS", "METRICS", "SCORE"]) }),
  cancelJob: z.object({ id }),
  review: z.object({ id, adultStatus: z.enum(AdultStatus), reviewStatus: z.enum(ReviewStatus), evidence: z.string().trim().max(2048).optional(),
    business: z.enum(["yes", "no", "unknown"]).optional() }),
  content: z.object({ id, url: z.string().max(2048), title: shortText, description: note.optional(), approved: z.literal("yes") }),
  analysisReview: z.object({ id, analysisId: id }),
  publicMetrics: z.object({
    id, evidence: z.string().max(2048),
    followers: z.string().regex(/^\d{1,18}$/).optional(),
    engagement: z.coerce.number().min(0).max(100).optional(),
    activity: z.iso.date().optional(),
  }).refine(({ followers, engagement, activity }) => followers !== undefined || engagement !== undefined || activity !== undefined),
  subscriptionReview: z.object({ id, decision: z.enum(["confirm", "dismiss"]) }),
  candidate: z.object({ id, stage: z.enum(RecruitmentStage), active: z.enum(["yes", "no"]), assigneeId: id.optional(), followUpAt: z.iso.date().optional() }),
  note: z.object({ id, body: note }),
  tag: z.object({ id, name: z.string().trim().min(1).max(40), remove: z.enum(["yes", "no"]).optional() }),
  weights: weightsSchema,
  subscription: z.object({ name: shortText, value: shortText, domain: z.enum(["yes", "no"]), ambiguous: z.enum(["yes", "no"]).optional() }),
  aliasDelete: z.object({ id }),
  template: z.object({ id: id.optional(), name: shortText, body: z.string().trim().min(1).max(1000) }),
  templateArchive: z.object({ id }),
  dmRecord: z.object({ id, status: z.enum(["MANUALLY_SENT", "REPLIED", "FAILED"]), evidence: note, sender: z.string().trim().regex(/^@?[\w.]{1,30}$/).optional() }),
  instagramDisconnect: z.object({ id }),
  correspondent: z.object({ id, connectionId: id, accountId: id }),
  erase: z.object({ id, confirmed: z.literal("DELETE"), reason: note }),
};
type Command = keyof typeof schemas;

export function formPayload(form: FormData, command: string) {
  const input = Object.fromEntries([...form].filter(([key, value]) => !key.startsWith("_") && typeof value === "string" && value !== ""));
  if (command === "discovery") return { ...input, platforms: form.getAll("platforms") };
  if (command === "preset") {
    const filters = Object.fromEntries([...form].filter(([key, value]) => key !== "name" && typeof value === "string" && value !== ""));
    return { name: input.name, filters: { ...filters, platform: form.getAll("platform") } };
  }
  if (command === "weights") return Object.fromEntries(weightKeys.map((key) => [key, input[key] === undefined ? null : Number(input[key])]));
  return input;
}
export async function command(raw: string, input: unknown, actorId: string) {
  check(Object.hasOwn(schemas, raw), "지원되지 않는 요청입니다.");
  const name = raw as Command;
  if (name === "profile") {
    const account = await registerProfile(schemas.profile.parse(input), actorId);
    return { id: account.id, creatorId: account.creatorId };
  }
  if (name === "cancelJob") return cancelJob(schemas.cancelJob.parse(input).id, actorId);
  if (name === "dmRecord") {
    const data = schemas.dmRecord.parse(input);
    return recordDM(data.id, actorId, data.status, data.evidence, data.sender?.replace(/^@/, "").toLowerCase());
  }
  if (name === "instagramDisconnect") return { unsubscribed: await disconnectInstagram(schemas.instagramDisconnect.parse(input).id, actorId) };
  let verifiedHandle: string | undefined;
  if (name === "correspondent") {
    const data = schemas.correspondent.parse(input);
    verifiedHandle = await correspondentUsername(data.connectionId, data.id, actorId);
  }
  return db.$transaction(async (tx) => {
    let entityId: string | undefined;
    let result: { id?: string } = {};
    switch (name) {
      case "discovery": {
        const data = schemas.discovery.parse(input);
        const payload = { ...data, platforms: platforms.filter((platform) => data.platforms.includes(platform)) };
        await lock(tx, "discovery:" + actorId + ":" + JSON.stringify(payload));
        const existing = await tx.job.findFirst({
          where: {
            actorId,
            type: "DISCOVERY",
            payload: { equals: payload },
            OR: [
              { status: { in: ["PENDING", "RUNNING"] } },
              { status: "COMPLETED", updatedAt: { gte: new Date(Date.now() - 3000) } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          select: { id: true },
        });
        if (existing) return { id: existing.id, reused: true };
        const job = await enqueue(tx, "DISCOVERY", payload, actorId);
        result = { id: job.id }; entityId = job.id;
        break;
      }
      case "preset": {
        const { name, filters } = schemas.preset.parse(input);
        const preset = await tx.searchPreset.upsert({ where: { ownerId_name: { ownerId: actorId, name } },
          update: { filters }, create: { ownerId: actorId, name, filters } });
        entityId = preset.id;
        break;
      }
      case "presetDelete": {
        const { id } = schemas.presetDelete.parse(input);
        await tx.searchPreset.deleteMany({ where: { id, ownerId: actorId } }); entityId = id;
        break;
      }
      case "job": {
        const { id, type } = schemas.job.parse(input);
        const payload = type === "SCORE" ? { creatorId: id } : { accountId: id };
        if (type === "SCORE") await tx.creator.findUniqueOrThrow({ where: { id } });
        else await tx.creatorPlatformAccount.findUniqueOrThrow({ where: { id } });
        const job = await enqueue(tx, type === "SCORE" ? "METRICS" : type, payload, actorId);
        if (type === "ANALYSIS") await tx.creatorPlatformAccount.update({ where: { id }, data: { analysisStatus: "PENDING" } });
        result = { id: job.id }; entityId = job.id;
        break;
      }
      case "review": {
        const { id, adultStatus, reviewStatus, evidence, business } = schemas.review.parse(input);
        await lock(tx, "dm:" + id);
        const verified = adultStatus === "VERIFIED";
        check(!verified || evidence, "신뢰할 수 있는 공개 성인 확인 근거 URL을 기록하세요.");
        const url = evidence ? link(evidence) : null;
        await tx.creator.update({ where: { id }, data: { adultStatus, reviewStatus, adultEvidence: url, adultVerifiedAt: verified ? new Date() : null,
          businessContact: business === undefined ? undefined : business === "unknown" ? null : business === "yes", score: null,
          scoreEvidence: Prisma.DbNull, scoredAt: null } });
        if (verified && reviewStatus === "CLEARED") await enqueue(tx, "METRICS", { creatorId: id }, actorId);
        entityId = id;
        break;
      }
      case "content": {
        const { id, url, title, description } = schemas.content.parse(input);
        const account = await tx.creatorPlatformAccount.findUniqueOrThrow({ where: { id }, include: { creator: true } });
        await lock(tx, "dm:" + account.creatorId);
        const creator = await tx.creator.findUniqueOrThrow({ where: { id: account.creatorId } });
        check(creator.adultStatus === "VERIFIED" && creator.reviewStatus === "CLEARED", "계정 검토 후 적법한 공개 게시물만 등록할 수 있습니다.");
        const contentUrl = link(url);
        const host = new URL(contentUrl).hostname.replace(/^www\./, "");
        const hosts = { INSTAGRAM: ["instagram.com"], YOUTUBE: ["youtube.com", "youtu.be"], TIKTOK: ["tiktok.com"], NAVER_BLOG: ["blog.naver.com", "m.blog.naver.com"] };
        check(hosts[account.platform].includes(host), "계정과 같은 SNS의 공개 게시물을 입력하세요.");
        const existing = await tx.creatorContent.findUnique({ where: { accountId_url: { accountId: id, url: contentUrl } } });
        if (existing?.source === "OFFICIAL_API") check(false, "공급자가 수집한 게시물은 표시 용도로 보관됩니다. 별도의 공개 게시물 근거를 입력하세요.");
        await tx.creatorContent.upsert({ where: { accountId_url: { accountId: id, url: contentUrl } },
          create: { accountId: id, url: contentUrl, title, description, source: "MANUAL", reviewStatus: "CLEARED" },
          update: { title, description, reviewStatus: "CLEARED" } });
        entityId = id;
        break;
      }
      case "analysisReview": {
        const { id, analysisId } = schemas.analysisReview.parse(input);
        const changed = await tx.analysisResult.updateMany({ where: { id: analysisId, accountId: id, status: "COMPLETED" }, data: { manuallyReviewed: true } });
        check(changed.count, "분석 결과를 찾을 수 없습니다."); entityId = analysisId;
        break;
      }
      case "publicMetrics": {
        const { id, evidence, followers, engagement, activity } = schemas.publicMetrics.parse(input);
        const account = await tx.creatorPlatformAccount.findUniqueOrThrow({ where: { id }, include: { creator: true } });
        await lock(tx, "collection:" + account.platform);
        await lock(tx, "dm:" + account.creatorId);
        const creator = await tx.creator.findUniqueOrThrow({ where: { id: account.creatorId } });
        check(creator.reviewStatus !== "HOLD" && creator.adultStatus !== "EXCLUDED", "검토 보류 중인 계정입니다.");
        check(account.source === "MANUAL", "관리자가 수동 등록한 계정만 지표를 직접 입력할 수 있습니다.");
        const observedAt = new Date();
        const lastActiveAt = activity ? new Date(activity + "T00:00:00+09:00") : undefined;
        check(!lastActiveAt || lastActiveAt <= observedAt, "최근 활동일이 미래일 수 없습니다.");
        const metrics = { followers: followers === undefined ? undefined : BigInt(followers), engagement: engagement === undefined ? undefined : engagement / 100 };
        await tx.creatorPlatformAccount.update({ where: { id }, data: { ...metrics, lastActiveAt } });
        await tx.creatorMetricSnapshot.create({ data: { accountId: id, ...metrics, capturedAt: observedAt } });
        await enqueue(tx, "METRICS", { creatorId: creator.id }, actorId);
        await audit(tx, actorId, "PUBLIC_METRICS", id, { evidence: link(evidence) });
        return { id };
      }
      case "subscriptionReview": {
        const { id, decision } = schemas.subscriptionReview.parse(input);
        const target = await tx.creatorSubscriptionPlatform.findUniqueOrThrow({ where: { id }, select: { accountId: true } });
        await lock(tx, "subscriptions:" + target.accountId);
        const detected = await tx.creatorSubscriptionPlatform.findUniqueOrThrow({ where: { id }, include: { evidence: true } });
        check(detected.evidence.length && detected.evidence.every((item) => item.ambiguous), "모호한 감지 결과만 검토할 수 있습니다.", 409);
        if (decision === "confirm") await tx.subscriptionPlatformEvidence.updateMany({ where: { detectionId: id }, data: { ambiguous: false } });
        else await tx.creatorSubscriptionPlatform.delete({ where: { id } });
        const remaining = await tx.subscriptionPlatformEvidence.findMany({ where: { detection: { accountId: detected.accountId } }, select: { ambiguous: true } });
        await tx.creatorPlatformAccount.update({ where: { id: detected.accountId },
          data: { detectionStatus: remaining.some((item) => !item.ambiguous) ? "DETECTED" : remaining.length ? "REVIEW" : "UNKNOWN" } });
        entityId = detected.accountId;
        break;
      }
      case "candidate": {
        const { id, stage, active, assigneeId, followUpAt } = schemas.candidate.parse(input);
        await lock(tx, "dm:" + id);
        const creator = await tx.creator.findUniqueOrThrow({ where: { id } });
        check(active === "no" || ["CANDIDATE", "REVIEWING", "REJECTED"].includes(stage) ||
          (creator.adultStatus === "VERIFIED" && creator.reviewStatus === "CLEARED"), "해당 단계로 진행하려면 성인 여부와 콘텐츠 검토를 완료하세요.");
        const data = { stage, active: active === "yes", assigneeId: assigneeId ?? null, followUpAt: followUpAt ? new Date(followUpAt + "T00:00:00+09:00") : null };
        const candidate = await tx.recruitmentCandidate.upsert({ where: { creatorId: id }, create: { ...data, creatorId: id }, update: data });
        await tx.recruitmentActivity.create({ data: { candidateId: candidate.id, actorId, stage, action: data.active ? "UPDATE" : "REMOVE" } });
        entityId = candidate.id;
        break;
      }
      case "note": {
        const { id, body } = schemas.note.parse(input);
        await tx.recruitmentNote.create({ data: { creatorId: id, actorId, body } }); entityId = id;
        break;
      }
      case "tag": {
        const { id, name, remove } = schemas.tag.parse(input);
        await tx.creator.update({ where: { id }, data: { tags: remove === "yes" ? { disconnect: { name } } : { connectOrCreate: { where: { name }, create: { name } } } } });
        entityId = id; break;
      }
      case "weights": {
        const value = schemas.weights.parse(input);
        await tx.setting.upsert({ where: { key: "weights" }, create: { key: "weights", value }, update: { value } });
        break;
      }
      case "subscription": {
        const data = schemas.subscription.parse(input);
        const isDomain = data.domain === "yes";
        const value = isDomain ? data.value.toLowerCase() : data.value.normalize("NFKC");
        check(isDomain ? /^[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/.test(value) && publicUrl("https://" + value) : /[\p{L}\p{N}]/u.test(value),
          "별칭 또는 전체 호스트명을 입력하세요.");
        const platform = await tx.subscriptionPlatform.upsert({ where: { name: data.name }, create: { name: data.name }, update: {} });
        await tx.subscriptionPlatformAlias.upsert({ where: { platformId_value_isDomain: { platformId: platform.id, value, isDomain } },
          create: { platformId: platform.id, value, isDomain, ambiguous: data.ambiguous === "yes" }, update: { ambiguous: data.ambiguous === "yes" } });
        entityId = platform.id;
        break;
      }
      case "aliasDelete": {
        const { id } = schemas.aliasDelete.parse(input);
        await tx.subscriptionPlatformAlias.delete({ where: { id } }); entityId = id;
        break;
      }
      case "template": {
        const { id, name, body } = schemas.template.parse(input);
        const template = id ? await tx.dMTemplate.update({ where: { id, archivedAt: null }, data: { name, body } }) : await tx.dMTemplate.create({ data: { name, body } });
        entityId = template.id;
        break;
      }
      case "templateArchive": {
        const { id } = schemas.templateArchive.parse(input);
        await tx.dMTemplate.update({ where: { id }, data: { archivedAt: new Date() } }); entityId = id;
        break;
      }
      case "correspondent": {
        const { id, accountId, connectionId } = schemas.correspondent.parse(input);
        const account = await tx.creatorPlatformAccount.findUniqueOrThrow({ where: { id: accountId } });
        check(account.platform === "INSTAGRAM" && account.handle.toLowerCase() === verifiedHandle, "Meta가 확인한 사용자명과 프로필이 일치하지 않습니다.", 409);
        await tx.instagramCorrespondent.update({ where: { id, connectionId, connection: { ownerId: actorId } }, data: { accountId, linkEvidence: account.profileUrl } });
        entityId = id;
        break;
      }
      case "erase": {
        const { id } = schemas.erase.parse(input);
        for (const platform of ["INSTAGRAM", "NAVER_BLOG", "TIKTOK", "YOUTUBE"]) await lock(tx, "collection:" + platform);
        await lock(tx, "dm:" + id);
        const creator = await tx.creator.findUniqueOrThrow({ where: { id }, include: { accounts: { select: { id: true, messages: { select: { id: true } } } } } });
        const accountIds = creator.accounts.map((item) => item.id);
        const messageIds = creator.accounts.flatMap((item) => item.messages.map((message) => message.id));
        const inFlight = await tx.dMMessage.count({ where: { accountId: { in: accountIds }, status: "SENDING" } });
        check(!inFlight, "전송 중인 작업이 끝난 뒤 삭제하세요.", 409);
        await tx.job.deleteMany({ where: { OR: [
          { payload: { path: ["creatorId"], equals: id } },
          ...accountIds.map((value) => ({ payload: { path: ["accountId"], equals: value } })),
          ...messageIds.map((value) => ({ payload: { path: ["messageId"], equals: value } })),
        ] } });
        await tx.instagramCorrespondent.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.auditLog.deleteMany({ where: { entityId: { in: [id, ...accountIds, ...messageIds] } } });
        await tx.creator.delete({ where: { id } });
        await audit(tx, actorId, "CREATOR_ERASED");
        return {};
      }
    }
    await audit(tx, actorId, name, entityId);
    return result;
  });
}
