import type { Prisma } from "@prisma/client";

export function audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityId?: string, detail?: Prisma.InputJsonValue) {
  return tx.auditLog.create({ data: { actorId, action, entityId, detail } });
}
export async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
