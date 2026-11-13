import { db } from "@/lib/db";
import { lock } from "./audit";
import { enqueue } from "./jobs";

export async function retain() {
  const now = new Date();
  const historyCutoff = new Date(now.getTime() - 90 * 86400000);
  const youtubeCutoff = new Date(now.getTime() - 29 * 86400000);
  const refreshCutoff = new Date(now.getTime() + 3 * 86400000);
  const accounts = await db.creatorPlatformAccount.findMany({ where: { platform: "YOUTUBE", expiresAt: { lte: refreshCutoff } }, orderBy: { expiresAt: "asc" }, take: 500 });
  for (const account of accounts) {
    await db.$transaction(async (tx) => {
      await lock(tx, "collection:YOUTUBE");
      const current = await tx.creatorPlatformAccount.findUnique({ where: { id: account.id } });
      if (!current?.expiresAt) return;
      await tx.creatorMetricSnapshot.deleteMany({ where: { accountId: account.id, capturedAt: { lt: youtubeCutoff } } });
      await tx.creatorContent.deleteMany({ where: { accountId: account.id, source: "OFFICIAL_API", collectedAt: { lt: youtubeCutoff } } });
      if (current.expiresAt <= now) {
        await tx.creatorPlatformAccount.update({ where: { id: account.id }, data: { followers: null, lastActiveAt: null, avatarUrl: null, engagement: null, expiresAt: null,
          ...(current.source === "OFFICIAL_API" ? { bio: null, links: [], handle: current.externalId ?? "YouTube" } : {}) } });
        const count = await tx.creatorPlatformAccount.count({ where: { creatorId: account.creatorId } });
        if (count === 1 && current.source === "OFFICIAL_API")
          await tx.creator.update({ where: { id: account.creatorId }, data: { name: "YouTube 채널", country: null } });
      }
      if (process.env.YOUTUBE_API_KEY) await enqueue(tx, "REFRESH", { accountId: account.id }, undefined, "youtube-refresh:" + account.id + ":" + now.toISOString().slice(0, 10));
    });
  }
  await db.creatorMetricSnapshot.deleteMany({ where: { capturedAt: { lt: youtubeCutoff }, account: { platform: "YOUTUBE" } } });
  await db.creatorContent.deleteMany({ where: { collectedAt: { lt: youtubeCutoff }, account: { platform: "YOUTUBE" }, source: "OFFICIAL_API" } });
  await db.$transaction([
    db.userSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.rateBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.providerRequestLog.deleteMany({ where: { createdAt: { lt: historyCutoff } } }),
    db.instagramEvent.deleteMany({ where: { createdAt: { lt: historyCutoff } } }),
    db.instagramConnection.updateMany({ where: { expiresAt: { lte: now }, tokenCiphertext: { not: null } }, data: { tokenCiphertext: null, subscribed: false } }),
  ]);
  return { accountsChecked: accounts.length };
}
