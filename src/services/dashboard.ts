import { db } from "@/lib/db";

export async function dashboard() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000);
  const available = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [total, fresh, social, stages, statuses, analyzed, fan, categories, detections] = await db.$transaction([
    db.creator.count(), db.creator.count({ where: { createdAt: { gte: since } } }),
    db.creatorPlatformAccount.groupBy({ by: ["platform"], where: available, _count: { _all: true }, orderBy: { platform: "asc" } }),
    db.recruitmentCandidate.groupBy({ by: ["stage"], where: { active: true }, _count: { _all: true }, orderBy: { stage: "asc" } }),
    db.creator.groupBy({ by: ["contactStatus"], where: { accounts: { some: { platform: "INSTAGRAM" } } },
      _count: { _all: true }, orderBy: { contactStatus: "asc" } }),
    db.creator.count({ where: { adultStatus: "VERIFIED", reviewStatus: "CLEARED", accounts: { some: { analysisStatus: "COMPLETED" } } } }),
    db.$queryRaw<{ name: string; total: bigint }[]>`
      SELECT p.name, count(DISTINCT a."creatorId") AS total
      FROM "SubscriptionPlatform" p JOIN "CreatorSubscriptionPlatform" d ON d."platformId" = p.id
      JOIN "CreatorPlatformAccount" a ON a.id = d."accountId"
      WHERE (a."expiresAt" IS NULL OR a."expiresAt" > now()) AND
        EXISTS (SELECT 1 FROM "SubscriptionPlatformEvidence" e WHERE e."detectionId" = d.id AND NOT e.ambiguous)
      GROUP BY p.name ORDER BY total DESC`,
    db.$queryRaw<{ name: string; total: bigint }[]>`
      SELECT e.category::text AS name, count(DISTINCT a."creatorId") AS total
      FROM "AnalysisEvidence" e JOIN "AnalysisResult" r ON r.id = e."analysisId"
      JOIN "CreatorPlatformAccount" a ON a.id = r."accountId" JOIN "Creator" c ON c.id = a."creatorId"
      WHERE a."analysisStatus" = 'COMPLETED' AND c."reviewStatus" = 'CLEARED' AND c."adultStatus" = 'VERIFIED'
        AND r.id = (SELECT latest.id FROM "AnalysisResult" latest WHERE latest."accountId" = a.id AND latest.status = 'COMPLETED'
          ORDER BY latest."createdAt" DESC, latest.id DESC LIMIT 1)
      GROUP BY e.category`,
    db.creatorPlatformAccount.groupBy({ by: ["detectionStatus"], where: available, _count: { _all: true }, orderBy: { detectionStatus: "asc" } }),
  ]);
  const sent = await db.creator.count({ where: { accounts: { some: { messages: { some: { status: { in: ["SENT", "MANUALLY_SENT"] } } } } } } });
  return { total, fresh, social, stages, statuses, analyzed, sent, detections, fan: fan.map((x) => ({ name: x.name, total: Number(x.total) })),
    categories: categories.map((x) => ({ name: x.name, total: Number(x.total) })) };
}
