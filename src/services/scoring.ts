import { z } from "zod";
import { db } from "@/lib/db";
import { lock } from "./audit";

export const weightKeys = ["category", "activity", "engagement", "scale", "business"] as const;
const weight = z.number().int().min(0).max(100);
export const weightsSchema = z.object({ category: weight, activity: weight, engagement: weight, scale: weight, business: weight })
  .refine((data) => Object.values(data).reduce((total, value) => total + value, 0) === 100, "가중치 합계는 100이어야 합니다.");
export const defaultWeights = { category: 35, activity: 25, engagement: 20, scale: 10, business: 10 };
export async function currentWeights() {
  const setting = await db.setting.findUnique({ where: { key: "weights" } });
  const parsed = weightsSchema.safeParse(setting?.value);
  return parsed.success ? parsed.data : defaultWeights;
}

export async function scoreCreator(creatorId: string) {
  const weights = await currentWeights();
  return db.$transaction(async (tx) => {
    await lock(tx, "dm:" + creatorId);
    const creator = await tx.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { accounts: {
      where: { platform: { not: "YOUTUBE" } },
      include: { analyses: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, include: { evidence: true } },
        metrics: { take: 1, orderBy: { capturedAt: "desc" }, select: { capturedAt: true } } },
    } } });
    const eligible = creator.adultStatus === "VERIFIED" && creator.reviewStatus === "CLEARED";
    const date = new Date();
    const metrics: Record<typeof weightKeys[number], number | null> = { category: null, activity: null, engagement: null, scale: null, business: null };
    function maximum(key: keyof typeof metrics, value: number) {
      metrics[key] = Math.max(metrics[key] ?? 0, Math.min(100, Math.max(0, value)));
    }
    if (eligible) {
      for (const account of creator.accounts) {
        if (account.analysisStatus === "COMPLETED") {
          for (const evidence of account.analyses[0]?.evidence ?? []) maximum("category", evidence.category === "OTHER" ? 0 : evidence.confidence * 100);
        }
        if (account.lastActiveAt) maximum("activity", 100 * (1 - (date.getTime() - account.lastActiveAt.getTime()) / (90 * 86400000)));
        if (account.engagement !== null) maximum("engagement", account.engagement * 1000);
        if (account.followers !== null) maximum("scale", Math.log10(Number(account.followers) + 1) * 20);
      }
      if (creator.businessContact !== null) maximum("business", creator.businessContact ? 100 : 0);
    }
    const present = weightKeys.filter((key) => metrics[key] !== null);
    const total = present.reduce((sum, key) => sum + weights[key], 0);
    const score = total ? Math.round(present.reduce((sum, key) => sum + (metrics[key] ?? 0) * weights[key], 0) / total) : null;
    const observedAt = creator.accounts.map((account) => ({
      profile: account.profileUrl, collectedAt: (account.metrics[0]?.capturedAt ?? account.collectedAt)?.toISOString() ?? null,
    }));
    await tx.creator.update({ where: { id: creatorId }, data: { score, scoredAt: date, scoreEvidence: { metrics, weights, observedAt } } });
    return { score };
  });
}
