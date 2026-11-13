import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { type Job, type Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { log, safeError } from "@/lib/errors";
import { isSupportedPlatform } from "@/lib/platforms";
import { analyze } from "@/services/analysis";
import { collect, RetryJob } from "@/services/collection";
import { deliverDM, expireDM } from "@/services/dm";
import { enqueue } from "@/services/jobs";
import { retain } from "@/services/retention";
import { scanSubscriptions } from "@/services/subscriptions";
import { scoreCreator } from "@/services/scoring";

const leaseSeconds = 180;
const uuid = z.uuid();
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopping = true; });

async function claim() {
  return db.$transaction(async (tx) => {
    const [job] = await tx.$queryRaw<Job[]>`
      SELECT * FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "leaseUntil" <= now())
      ORDER BY "runAt", "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!job) return;
    if (job.attempts >= job.maxAttempts) {
      if (job.type === "DM_SEND") await expireDM(tx, job.id);
      await tx.job.update({ where: { id: job.id }, data: { status: "FAILED", error: "작업이 중단되었습니다.", leaseUntil: null, leaseToken: null } });
      return;
    }
    return tx.job.update({ where: { id: job.id }, data: { status: "RUNNING", attempts: { increment: 1 },
      leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + leaseSeconds * 1000), error: null } });
  });
}
async function run(job: Job, progress: (value: number) => Promise<void>): Promise<Prisma.InputJsonObject> {
  if (job.type === "RETENTION") return retain();
  if (job.type === "DISCOVERY" || job.type === "REFRESH") return collect(job, progress);
  if (job.type === "DM_SEND") {
    const result = await deliverDM(z.object({ messageId: uuid }).parse(job.payload).messageId);
    if (result.status === "FAILED") throw new Error("DM_DELIVERY_FAILED");
    return result;
  }
  if (job.type === "METRICS") {
    const score = z.object({ creatorId: uuid }).safeParse(job.payload);
    return score.success ? scoreCreator(score.data.creatorId) : collect(job, progress);
  }
  const { accountId } = z.object({ accountId: uuid }).parse(job.payload);
  const { platform } = await db.creatorPlatformAccount.findUniqueOrThrow({ where: { id: accountId }, select: { platform: true } });
  if (!isSupportedPlatform(platform)) return { status: "NOT_SUPPORTED", reason: "연동이 종료된 플랫폼입니다." };
  return job.type === "ANALYSIS" ? analyze(accountId, job.id) : scanSubscriptions(accountId);
}

async function tick() {
  const job = await claim();
  if (!job) return false;
  const where = { id: job.id, status: "RUNNING" as const, leaseToken: job.leaseToken };
  const renew = setInterval(() => {
    void db.job.updateMany({ where, data: { leaseUntil: new Date(Date.now() + leaseSeconds * 1000) } })
      .catch(() => log("warn", "lease_update_failed", { jobId: job.id }));
  }, 30_000);
  try {
    const result = await run(job, async (progress) => {
      await db.job.updateMany({ where, data: { progress } });
    });
    await db.job.updateMany({ where, data: { status: "COMPLETED", progress: 100, result, leaseToken: null, leaseUntil: null } });
    log("info", "job_completed", { jobId: job.id, type: job.type });
  } catch (error) {
    const failure = error instanceof RetryJob ? error.message : job.type === "DM_SEND" ? "DM 전송 관리에서 시도 결과를 확인하세요." : safeError(error).message;
    const retry = error instanceof RetryJob && job.attempts < job.maxAttempts;
    await db.$transaction(async (tx) => {
      const changed = await tx.job.updateMany({ where, data: { status: retry ? "PENDING" : "FAILED", error: failure,
        runAt: new Date(Date.now() + 60_000 * job.attempts), leaseToken: null, leaseUntil: null } });
      if (changed.count && job.type === "DM_SEND") await expireDM(tx, job.id);
      if (changed.count && job.type === "ANALYSIS") {
        const { accountId } = z.object({ accountId: uuid }).parse(job.payload);
        await tx.creatorPlatformAccount.updateMany({ where: { id: accountId }, data: { analysisStatus: "FAILED" } });
      }
    });
    log("warn", "job_failed", { jobId: job.id, type: job.type, retry });
  } finally { clearInterval(renew); }
  return true;
}

async function main() {
  log("info", "worker_started");
  let nextRetention = 0;
  while (!stopping) {
    try {
      const now = Date.now();
      if (now >= nextRetention) {
        await enqueue(db, "RETENTION", {}, undefined, "retention:" + new Date(now).toISOString().slice(0, 13));
        nextRetention = now + 60_000;
      }
      if (!await tick()) await pause(1500);
    } catch { log("error", "worker_poll_failed"); await pause(5000); }
  }
}
main().finally(() => db.$disconnect());
