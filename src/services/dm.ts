import { createHash, createHmac } from "node:crypto";
import { Prisma, type DMMessage, type DmStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, equals } from "@/lib/crypto";
import { check } from "@/lib/errors";
import { audit, lock } from "./audit";
import { enqueue } from "./jobs";
import { bearer, graph, messagingScope } from "./instagram";

export const batchLimit = 100;
const contacted: DmStatus[] = ["SENT", "MANUALLY_SENT"];
const active: DmStatus[] = ["QUEUED", "SENDING", "NOT_ELIGIBLE"];
export const composeSchema = z.object({
  accountIds: z.array(z.uuid()).min(1).max(batchLimit),
  body: z.string().trim().min(1).max(1000),
  connectionId: z.uuid().optional(), templateId: z.uuid().optional(),
  requestId: z.uuid(), followUpToId: z.uuid().optional(),
  send: z.boolean().default(false),
});
type Compose = z.infer<typeof composeSchema>;
const previewApproval = z.object({ expiresAt: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/) });

function approvalHash(input: Compose, actorId: string, expiresAt: number, rows: Awaited<ReturnType<typeof recipients>>) {
  const secret = process.env.SESSION_SECRET;
  check(secret && secret.length >= 32, "SESSION_SECRET을 설정해 주세요.", 503);
  const reviewed = rows.map(({ target, body, blocked, correspondent }) => ({
    id: target.id, body, blocked, scopedId: correspondent?.scopedId ?? null,
  }));
  const contents = { actorId, expiresAt, requestId: input.requestId, accountIds: [...input.accountIds].sort(),
    connectionId: input.connectionId, templateId: input.templateId, followUpToId: input.followUpToId, reviewed };
  return createHmac("sha256", secret).update("creator-radar:dm-preview:").update(JSON.stringify(contents)).digest("hex");
}
const targetInclude = { creator: true, correspondents: { include: { connection: true } } } satisfies Prisma.CreatorPlatformAccountInclude;
type Target = Prisma.CreatorPlatformAccountGetPayload<{ include: typeof targetInclude }>;
function bodyFor(body: string, target: Target) {
  return body.replace(/\{\{(name|handle)\}\}/g, (_, field) => field === "name" ? target.creator.name : target.handle);
}
function allowed(target: Target) { return target.creator.adultStatus === "VERIFIED" && target.creator.reviewStatus === "CLEARED"; }
function messaging(target: Target, actorId: string, connectionId?: string) {
  if (!connectionId || !allowed(target)) return;
  return target.correspondents.find(({ lastInboundAt, connection }) => connection.id === connectionId && connection.ownerId === actorId &&
    !connection.disconnectedAt && connection.tokenCiphertext && connection.subscribed && connection.scopes.includes(messagingScope) &&
    connection.expiresAt.getTime() > Date.now() + 15_000 && lastInboundAt.getTime() <= Date.now() &&
    lastInboundAt.getTime() > Date.now() - 24 * 3600_000 + 15_000);
}

async function recipients(tx: Prisma.TransactionClient, input: Compose, actorId: string) {
  const targets = await tx.creatorPlatformAccount.findMany({ where: { id: { in: input.accountIds }, platform: "INSTAGRAM" }, include: targetInclude });
  check(targets.length === new Set(input.accountIds).size, "등록된 Instagram 계정만 선택하세요.");
  check(!input.followUpToId || targets.length === 1, "후속 연락은 한 대상씩 진행하세요.");
  const prior = await tx.dMMessage.findMany({ where: { account: { creatorId: { in: targets.map((target) => target.creatorId) } },
    OR: [{ status: { in: [...contacted, ...active] } }, { uncertain: true }] },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    select: { id: true, accountId: true, status: true, uncertain: true, account: { select: { creatorId: true } } } });
  const seen = new Set<string>();
  const rows = [];
  for (const target of targets.sort((a, b) => a.id.localeCompare(b.id))) {
    const history = prior.filter((message) => message.account.creatorId === target.creatorId);
    const previous = history.find((message) => contacted.includes(message.status));
    const sent = Boolean(previous);
    const duplicate = seen.has(target.creatorId) || history.some((message) => active.includes(message.status) || message.uncertain);
    const followUp = Boolean(input.followUpToId && previous && previous.id === input.followUpToId && previous.accountId === target.id);
    check(!input.followUpToId || followUp, "가장 최근에 완료된 연락에서 후속 연락을 작성하세요.");
    seen.add(target.creatorId);
    const body = bodyFor(input.body, target);
    check(Buffer.byteLength(body, "utf8") <= 1000 && body.trim(), "개인화 후 메시지는 UTF-8 기준 1,000바이트 이하여야 합니다.");
    const correspondent = messaging(target, actorId, input.connectionId);
    const reason = !allowed(target) ? "성인 여부와 콘텐츠 검토를 먼저 완료하세요." : duplicate ? "진행 중이거나 전송 확인이 필요한 작업이 있습니다." :
      sent && !followUp ? "이미 연락한 크리에이터입니다." : correspondent ? null : "발신 권한 또는 유효한 24시간 수신 이력이 없습니다.";
    rows.push({ target, body, sent, duplicate, blocked: !allowed(target) || duplicate || (sent && !followUp), correspondent, reason });
  }
  return rows;
}

export async function previewDM(input: Compose, actorId: string) {
  const rows = await recipients(db, input, actorId);
  const expiresAt = Date.now() + 10 * 60_000;
  return {
    approval: { expiresAt, hash: approvalHash(input, actorId, expiresAt, rows) },
    total: input.accountIds.length, api: rows.filter((row) => !row.blocked && row.correspondent).length,
    unavailable: rows.filter((row) => !row.blocked && !row.correspondent).length,
    sent: rows.filter((row) => row.sent).length, duplicate: rows.filter((row) => row.duplicate).length + input.accountIds.length - rows.length,
    blocked: rows.filter((row) => row.blocked).length,
    rows: rows.map(({ target, body, blocked, correspondent, reason }) => ({
      id: target.id, handle: target.handle, name: target.creator.name, body, api: Boolean(correspondent) && !blocked, blocked, reason,
    })),
  };
}
export async function composeDM(input: Compose, actorId: string, rawApproval: unknown) {
  const approval = previewApproval.parse(rawApproval);
  return db.$transaction(async (tx) => {
    await lock(tx, "compose:" + input.requestId);
    const existing = await tx.dMCampaign.findUnique({ where: { id: input.requestId }, select: { actorId: true, _count: { select: { messages: true } } } });
    if (existing) {
      check(existing.actorId === actorId, "요청 식별자가 이미 사용 중입니다.", 409);
      return { count: existing._count.messages, id: input.requestId };
    }
    const targets = await tx.creatorPlatformAccount.findMany({ where: { id: { in: input.accountIds } }, select: { creatorId: true } });
    for (const creatorId of [...new Set(targets.map((target) => target.creatorId))].sort()) await lock(tx, "dm:" + creatorId);
    const rows = await recipients(tx, input, actorId);
    check(approval.expiresAt > Date.now() && equals(approval.hash, approvalHash(input, actorId, approval.expiresAt, rows)),
      "미리보기가 만료되었거나 발송 자격이 변경되었습니다. 수신자별 미리보기를 다시 확인하세요.", 409);
    const chosen = rows.filter((row) => !row.blocked);
    check(chosen.length, "작업을 생성할 수 있는 대상이 없습니다.", 409);
    if (input.templateId) await tx.dMTemplate.findFirstOrThrow({ where: { id: input.templateId, archivedAt: null } });
    const connection = input.connectionId ? await tx.instagramConnection.findFirstOrThrow({ where: { id: input.connectionId, ownerId: actorId, disconnectedAt: null } }) : null;
    const campaign = await tx.dMCampaign.create({ data: { id: input.requestId, actorId } });
    for (const { target, correspondent, body, reason } of chosen) {
      const useApi = input.send && Boolean(correspondent);
      const status: DmStatus = !input.send ? "DRAFT" : useApi ? "QUEUED" : "NOT_ELIGIBLE";
      const idempotencyKey = createHash("sha256").update(campaign.id + ":" + target.id).digest("hex");
      const message = await tx.dMMessage.create({ data: {
        idempotencyKey, accountId: target.id, campaignId: campaign.id, actorId, connectionId: connection?.id, templateId: input.templateId,
        followUpToId: input.followUpToId, method: useApi ? "API" : "MANUAL", status, body,
        sender: connection?.username, recipientScopedId: correspondent?.scopedId,
        history: { create: { status, actorId, reason: status === "NOT_ELIGIBLE" ? reason : undefined } },
      } });
      if (useApi) {
        const job = await enqueue(tx, "DM_SEND", { messageId: message.id }, actorId, idempotencyKey);
        await tx.dMMessage.update({ where: { id: message.id }, data: { jobId: job.id } });
      }
      await tx.creator.update({ where: { id: target.creatorId }, data: { contactStatus: input.followUpToId ? "FOLLOW_UP" : status } });
    }
    await audit(tx, actorId, "DM_COMPOSE", campaign.id, { count: chosen.length, confirmedSend: input.send });
    return { count: chosen.length, id: campaign.id };
  }, { timeout: 25_000 });
}

export async function recordDM(id: string, actorId: string, status: "MANUALLY_SENT" | "REPLIED" | "FAILED", evidence: string, sender?: string) {
  return db.$transaction(async (tx) => {
    const original = await tx.dMMessage.findUniqueOrThrow({ where: { id }, include: { account: true } });
    await lock(tx, "dm:" + original.account.creatorId);
    const message = await tx.dMMessage.findUniqueOrThrow({ where: { id }, include: { account: { include: { creator: true } } } });
    if (status === "MANUALLY_SENT") {
      check(message.method === "MANUAL" && ["DRAFT", "NOT_ELIGIBLE"].includes(message.status), "수동 발송 작업만 완료 처리할 수 있습니다.");
      check(sender || message.sender, "실제 발신 계정명을 입력하세요.");
      const creator = message.account.creator;
      check(creator.adultStatus === "VERIFIED" && creator.reviewStatus === "CLEARED", "검토가 완료된 성인 계정에만 연락할 수 있습니다.");
      check(!await conflicts(tx, message, creator.id), "이미 전송했거나 전송 결과 확인이 필요한 작업이 있습니다.", 409);
      await tx.dMMessage.update({ where: { id }, data: { status, sentAt: new Date(), sender: sender ?? message.sender } });
    } else if (status === "FAILED") {
      check(message.uncertain || ["DRAFT", "NOT_ELIGIBLE"].includes(message.status), "확인 필요 작업 또는 미발송 초안만 종료할 수 있습니다.");
      await tx.dMMessage.update({ where: { id }, data: { status: "FAILED", uncertain: false, errorCode: "MANUAL_CLOSE" } });
    } else {
      check(contacted.includes(message.status), "발송이 확인된 연락만 답장을 기록할 수 있습니다.");
    }
    await tx.dMStatusHistory.create({ data: { messageId: id, status, actorId, reason: evidence } });
    const newest = await tx.dMMessage.findFirst({ where: { account: { creatorId: message.account.creatorId } }, orderBy: { requestedAt: "desc" }, select: { id: true } });
    if (newest?.id === id) await tx.creator.update({ where: { id: message.account.creatorId }, data: { contactStatus: status } });
    await audit(tx, actorId, "DM_" + status, id);
  });
}

async function conflicts(tx: Prisma.TransactionClient, message: DMMessage, creatorId: string) {
  const where = { account: { creatorId }, id: { not: message.id } };
  const inFlight = await tx.dMMessage.count({ where: { ...where, OR: [{ status: { in: ["QUEUED", "SENDING"] } }, { uncertain: true }] } });
  if (inFlight) return true;
  const latest = await tx.dMMessage.findFirst({ where: { ...where, status: { in: contacted } },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], select: { id: true } });
  return (latest?.id ?? null) !== message.followUpToId;
}

async function transition(tx: Prisma.TransactionClient, message: DMMessage, creatorId: string, status: DmStatus, extra: Prisma.DMMessageUpdateInput = {}, reason?: string) {
  await tx.dMMessage.update({ where: { id: message.id }, data: { ...extra, status } });
  await tx.dMStatusHistory.create({ data: { messageId: message.id, status, reason } });
  await tx.creator.update({ where: { id: creatorId }, data: { contactStatus: status } });
}

export async function deliverDM(messageId: string) {
  const prepared = await db.$transaction(async (tx) => {
    const original = await tx.dMMessage.findUniqueOrThrow({ where: { id: messageId }, include: { account: true } });
    await lock(tx, "dm:" + original.account.creatorId);
    const message = await tx.dMMessage.findUniqueOrThrow({ where: { id: messageId }, include: { account: { include: targetInclude } } });
    if (message.status !== "QUEUED") return null;
    const target = message.account;
    const prior = await conflicts(tx, message, target.creatorId);
    const correspondent = messaging(target, message.actorId, message.connectionId ?? undefined);
    if (prior || !correspondent || correspondent.scopedId !== message.recipientScopedId) {
      await transition(tx, message, target.creatorId, "NOT_ELIGIBLE", { method: "MANUAL", errorCode: "ELIGIBILITY_CHANGED" }, "전송 직전 중복 또는 자격 변경");
      return null;
    }
    const connection = correspondent.connection;
    await lock(tx, "dm-rate:" + connection.id);
    const minute = new Date(Date.now() - 60_000);
    const attempts = await tx.dMDeliveryAttempt.count({ where: { message: { connectionId: connection.id }, startedAt: { gt: minute } } });
    if (attempts >= 15) {
      await transition(tx, message, target.creatorId, "NOT_ELIGIBLE", { method: "MANUAL", errorCode: "LOCAL_RATE_LIMIT" }, "발신 계정 분당 제한");
      return null;
    }
    const token = decrypt(connection.tokenCiphertext!, connection.instagramId);
    const url = graph(connection.instagramId + "/messages");
    const attempt = await tx.dMDeliveryAttempt.create({ data: { messageId } });
    await transition(tx, message, target.creatorId, "SENDING");
    return { message, creatorId: target.creatorId, token, url, scopedId: correspondent.scopedId, attemptId: attempt.id };
  });
  if (!prepared) return { status: "SKIPPED" };
  const { message, creatorId, token, url, scopedId, attemptId } = prepared;
  let status: "SENT" | "FAILED" = "FAILED";
  let apiMessageId: string | undefined;
  let errorCode: string | undefined = "RESULT_UNCERTAIN";
  let uncertain = true;
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: scopedId }, message: { text: message.body } }) });
    const payload: unknown = await response.json();
    const sent = z.object({ message_id: z.string().min(1).max(255), recipient_id: z.string() }).safeParse(payload);
    const rejected = z.object({ error: z.object({ code: z.number() }) }).safeParse(payload);
    if (response.ok && sent.success && sent.data.recipient_id === scopedId) {
      status = "SENT"; apiMessageId = sent.data.message_id; errorCode = undefined; uncertain = false;
    } else if (response.status >= 400 && response.status < 500 && rejected.success) {
      errorCode = "META_" + rejected.data.error.code;
      uncertain = false;
    }
  } catch { /* An interrupted transport may have delivered the message. */ }
  await db.$transaction(async (tx) => {
    await lock(tx, "dm:" + creatorId);
    const current = await tx.dMMessage.findUniqueOrThrow({ where: { id: message.id } });
    if (current.status !== "SENDING") return;
    await tx.dMDeliveryAttempt.update({ where: { id: attemptId }, data: { finishedAt: new Date(), outcome: status, errorCode } });
    await transition(tx, current, creatorId, status, { apiMessageId, sentAt: status === "SENT" ? new Date() : null, uncertain, errorCode }, errorCode);
  });
  return { status, uncertain };
}

export async function expireDM(tx: Prisma.TransactionClient, jobId: string) {
  const message = await tx.dMMessage.findUnique({ where: { jobId }, include: { account: true } });
  if (!message || !["SENDING", "QUEUED"].includes(message.status)) return;
  const uncertain = message.status === "SENDING";
  await tx.dMDeliveryAttempt.updateMany({ where: { messageId: message.id, finishedAt: null }, data: { finishedAt: new Date(), outcome: "UNCERTAIN", errorCode: "WORKER_INTERRUPTED" } });
  await transition(tx, message, message.account.creatorId, "FAILED", { uncertain, errorCode: "WORKER_INTERRUPTED" }, uncertain ? "Meta 전송 여부 확인 필요" : "전송 요청 전 작업 중단");
}
