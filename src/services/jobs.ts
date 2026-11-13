import { Prisma, type JobType } from "@prisma/client";
import { db } from "@/lib/db";
import { check } from "@/lib/errors";
import { audit } from "./audit";

export function enqueue(tx: Prisma.TransactionClient, type: JobType, payload: Prisma.InputJsonObject, actorId?: string, dedupeKey?: string) {
  const data = { type, payload, actorId, dedupeKey, maxAttempts: type === "DM_SEND" ? 1 : 3 };
  return dedupeKey ? tx.job.upsert({ where: { dedupeKey }, create: data, update: {} }) : tx.job.create({ data });
}
export async function cancelJob(id: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const changed = await tx.job.updateMany({ where: { id, status: "PENDING", type: { notIn: ["DM_SEND", "RETENTION"] } }, data: { status: "CANCELLED" } });
    check(changed.count === 1, "대기 중인 수집·분석 작업만 취소할 수 있습니다.", 409);
    await audit(tx, actorId, "JOB_CANCEL", id);
  });
}
