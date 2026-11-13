import { AnalysisStatus, Category, DmStatus, Prisma, RecruitmentStage } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { platforms } from "@/lib/platforms";
import { messagingScope } from "./instagram";

const small = z.string().trim().max(160);
const optionalNumber = (limit: number) => z.coerce.number().min(0).max(limit).optional();
export const filtersSchema = z.object({
  q: small.optional(), country: small.optional(), region: small.optional(), platform: z.array(z.enum(platforms)).max(platforms.length).default([]),
  category: z.enum(Category).optional(), fan: small.optional(), analysis: z.enum(AnalysisStatus).optional(),
  stage: z.enum(RecruitmentStage).optional(), dm: z.enum(DmStatus).optional(),
  min: optionalNumber(1e15), max: optionalNumber(1e15), activity: optionalNumber(3650), engagement: optionalNumber(100),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  sort: z.enum(["collected", "name", "followers", "score", "activity"]).default("collected"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type Filters = z.infer<typeof filtersSchema>;
export function queryFilters(params: URLSearchParams) {
  const data = Object.fromEntries([...params].filter(([, value]) => value !== ""));
  return filtersSchema.parse({ ...data, platform: [...new Set(params.getAll("platform").filter(Boolean))] });
}
function whereFor(filters: Filters): Prisma.CreatorPlatformAccountWhereInput {
  const { platform, q, country, region, stage, dm, analysis, category, fan, min, max, activity, engagement } = filters;
  const now = new Date();
  const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const creator = { country: country ? ci(country) : undefined, region: region ? ci(region) : undefined,
    candidate: stage ? { active: true, stage } : undefined, contactStatus: dm };
  return {
    platform: platform.length ? { in: platform } : undefined, analysisStatus: analysis, creator,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ...(q ? [{ OR: [{ handle: ci(q) }, { profileUrl: ci(q) }, { creator: { name: ci(q) } }] }] : []),
    ],
    followers: min !== undefined || max !== undefined ? { gte: min === undefined ? undefined : BigInt(Math.ceil(min)), lte: max === undefined ? undefined : BigInt(Math.floor(max)) } : undefined,
    lastActiveAt: activity ? { gte: new Date(now.getTime() - activity * 86400000) } : undefined,
    engagement: engagement !== undefined ? { gte: engagement / 100 } : undefined,
    ...(category ? { analysisStatus: "COMPLETED", analyses: { some: { status: "COMPLETED", evidence: { some: { category } } } },
      creator: { ...creator, adultStatus: "VERIFIED", reviewStatus: "CLEARED" } } : {}),
    detectionStatus: fan === "none" ? "NONE" : fan === "unknown" ? "UNKNOWN" : fan === "review" ? "REVIEW" : undefined,
    subscriptions: fan && !["none", "unknown", "review"].includes(fan) ? { some: { platform: { name: fan }, evidence: { some: { ambiguous: false } } } } : undefined,
  };
}
const include = {
  creator: { include: { candidate: true } },
  analyses: { where: { status: "COMPLETED" }, take: 1, orderBy: { createdAt: "desc" }, include: { evidence: true } },
  subscriptions: { include: { platform: true, evidence: true } },
  correspondents: { select: { lastInboundAt: true, connection: { select: { ownerId: true, expiresAt: true, disconnectedAt: true, subscribed: true, scopes: true } } } },
} satisfies Prisma.CreatorPlatformAccountInclude;
const pageSize = 25;

export async function directory(filters: Filters, actorId: string, mode: "page" | "export" | "selection" = "page") {
  const where = whereFor(filters);
  const sort = {
    collected: { collectedAt: { sort: filters.dir, nulls: "last" } }, name: { creator: { name: filters.dir } },
    followers: { followers: { sort: filters.dir, nulls: "last" } }, score: { creator: { score: { sort: filters.dir, nulls: "last" } } },
    activity: { lastActiveAt: { sort: filters.dir, nulls: "last" } },
  } satisfies Record<string, Prisma.CreatorPlatformAccountOrderByWithRelationInput>;
  const [total, rows] = await db.$transaction([
    db.creatorPlatformAccount.count({ where }),
    db.creatorPlatformAccount.findMany({ where, include, orderBy: [sort[filters.sort], { id: "asc" }],
      skip: mode === "page" ? (filters.page - 1) * pageSize : 0, take: mode === "export" ? 10000 : mode === "selection" ? 101 : pageSize }),
  ], { isolationLevel: "RepeatableRead" });
  const now = Date.now();
  return { total, page: filters.page, pageSize, rows: rows.map((row) => ({
    id: row.id, creatorId: row.creatorId, name: row.creator.name, handle: row.handle, platform: row.platform, profileUrl: row.profileUrl,
    country: row.creator.country, followers: row.followers?.toString() ?? null,
    avatarUrl: row.avatarUrl, collectedAt: row.collectedAt?.toISOString() ?? null, activity: row.lastActiveAt?.toISOString() ?? null,
    fan: row.subscriptions.filter((match) => match.evidence.some((evidence) => !evidence.ambiguous)).map((match) => match.platform.name),
    detection: row.detectionStatus, analysis: row.analysisStatus,
    categories: row.creator.adultStatus === "VERIFIED" && row.creator.reviewStatus === "CLEARED" && row.analysisStatus === "COMPLETED"
      ? [...new Set(row.analyses.flatMap((result) => result.evidence.map(({ category }) => category)))] : [],
    score: row.creator.adultStatus === "VERIFIED" && row.creator.reviewStatus === "CLEARED" ? row.creator.score : null,
    dm: row.creator.contactStatus, stage: row.creator.candidate?.active ? row.creator.candidate.stage : null,
    apiEligible: row.creator.adultStatus === "VERIFIED" && row.creator.reviewStatus === "CLEARED" && row.correspondents.some(({ connection, lastInboundAt }) =>
      connection.ownerId === actorId && !connection.disconnectedAt && connection.subscribed && connection.scopes.includes(messagingScope) && connection.expiresAt.getTime() > now &&
      lastInboundAt.getTime() <= now && now - lastInboundAt.getTime() < 24 * 3600_000),
  })) };
}
export type DirectoryRow = Awaited<ReturnType<typeof directory>>["rows"][number];

export function csv(rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    const text = String(value ?? "");
    const safe = /^[\u0000-\u0020]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
