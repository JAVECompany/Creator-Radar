import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt, decrypt, equals } from "@/lib/crypto";
import { appUrl, graphVersion } from "@/lib/config";
import { check } from "@/lib/errors";
import { audit, lock } from "./audit";
import { officialJson } from "./providers/types";

const basic = "instagram_business_basic";
export const messagingScope = "instagram_business_manage_messages";
const callbackPath = "/api/instagram/callback";
const digest = (state: string) => createHash("sha256").update(state).digest("hex");
const numericId = z.string().regex(/^\d{1,50}$/);
export const instagramConfigured = () => Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.META_GRAPH_VERSION);
function callbackUrl() { return new URL(callbackPath, appUrl()).href; }

export async function oauthStart(sessionId: string) {
  check(instagramConfigured(), "Meta 앱 설정이 필요합니다.", 503);
  graphVersion();
  const state = randomBytes(32).toString("base64url");
  await db.oAuthState.create({ data: { digest: digest(state), sessionId, expiresAt: new Date(Date.now() + 10 * 60000) } });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID ?? "", redirect_uri: callbackUrl(),
    response_type: "code", scope: [basic, messagingScope].join(","), state, enable_fb_login: "0", force_authentication: "1" }).toString();
  return url;
}
export function graph(path: string) { return new URL("https://graph.instagram.com/" + graphVersion() + "/" + path); }
export function bearer(token: string) { return { Authorization: "Bearer " + token }; }

export async function oauthFinish(sessionId: string, ownerId: string, state: string, code: string) {
  const consumed = await db.oAuthState.deleteMany({ where: { digest: digest(state), sessionId, expiresAt: { gt: new Date() } } });
  check(consumed.count === 1, "OAuth 요청이 만료되었거나 일치하지 않습니다.", 403);
  const short = z.object({ access_token: z.string().min(1), permissions: z.union([z.string(), z.array(z.string())]).optional() });
  const response = await officialJson("https://api.instagram.com/oauth/access_token", {
    method: "POST", body: new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID ?? "", client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
      grant_type: "authorization_code", redirect_uri: callbackUrl(), code }),
  });
  const exchange = z.union([short, z.object({ data: z.array(short).length(1) }).transform(({ data }) => data[0])]).parse(response);
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET ?? "", access_token: exchange.access_token }).toString();
  const long = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await officialJson(longUrl));
  const meUrl = graph("me");
  meUrl.searchParams.set("fields", "user_id,username");
  const me = z.object({ user_id: z.union([numericId, z.number().int().safe().positive().transform(String)]), username: z.string().regex(/^[\w.]{1,30}$/) })
    .parse(await officialJson(meUrl, { headers: bearer(long.access_token) }));
  const scopes = typeof exchange.permissions === "string" ? exchange.permissions.split(/[ ,]+/).filter(Boolean) : exchange.permissions ?? [];
  const tokenCiphertext = encrypt(long.access_token, me.user_id);
  const existing = await db.instagramConnection.findUnique({ where: { instagramId: me.user_id } });
  check(!existing || existing.ownerId === ownerId, "다른 관리자가 연결한 Instagram 계정입니다.", 409);
  let subscribed = false;
  if (scopes.includes(messagingScope) && process.env.META_WEBHOOK_VERIFY_TOKEN) {
    const url = graph(me.user_id + "/subscribed_apps");
    url.searchParams.set("subscribed_fields", "messages");
    try { subscribed = z.object({ success: z.literal(true) }).safeParse(await officialJson(url, { method: "POST", headers: bearer(long.access_token) })).success; }
    catch { /* The profile connection remains available for reauthorization. */ }
  }
  return db.$transaction(async (tx) => {
    await lock(tx, "instagram:" + me.user_id);
    const prior = await tx.instagramConnection.findUnique({ where: { instagramId: me.user_id } });
    check(!prior || prior.ownerId === ownerId, "다른 관리자가 연결한 Instagram 계정입니다.", 409);
    const data = { username: me.username, tokenCiphertext, expiresAt: new Date(Date.now() + long.expires_in * 1000), scopes, subscribed, disconnectedAt: null };
    const connection = await tx.instagramConnection.upsert({ where: { instagramId: me.user_id }, update: data,
      create: { ...data, instagramId: me.user_id, ownerId } });
    await audit(tx, ownerId, "INSTAGRAM_CONNECT", connection.id, { subscribed });
    return connection;
  });
}
export async function disconnectInstagram(connectionId: string, actorId: string) {
  const connection = await db.instagramConnection.findFirstOrThrow({ where: { id: connectionId, ownerId: actorId } });
  await db.$transaction(async (tx) => {
    await tx.instagramConnection.update({ where: { id: connection.id }, data: { tokenCiphertext: null, subscribed: false, disconnectedAt: new Date() } });
    await audit(tx, actorId, "INSTAGRAM_DISCONNECT", connection.id);
  });
  if (connection.tokenCiphertext && connection.subscribed) {
    try { await officialJson(graph(connection.instagramId + "/subscribed_apps"), { method: "DELETE", headers: bearer(decrypt(connection.tokenCiphertext, connection.instagramId)) }); }
    catch { return false; }
  }
  return true;
}

const webhook = z.object({ object: z.literal("instagram"), entry: z.array(z.object({
  id: numericId,
  messaging: z.array(z.object({ sender: z.object({ id: numericId }), recipient: z.object({ id: numericId }),
    timestamp: z.number().int(), message: z.object({ mid: z.string().min(1).max(255), is_echo: z.boolean().optional(), is_self: z.boolean().optional(), is_unsupported: z.boolean().optional() }).optional(),
  })).optional(),
})).max(100) });

export async function receiveInstagram(raw: string, signature: string) {
  const secret = process.env.META_WEBHOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  check(secret && equals(signature, "sha256=" + createHmac("sha256", secret).update(raw).digest("hex")), "웹훅 서명이 올바르지 않습니다.", 403);
  const data = webhook.parse(JSON.parse(raw));
  for (const entry of data.entry) {
    const connection = await db.instagramConnection.findFirst({ where: { instagramId: entry.id, disconnectedAt: null, subscribed: true } });
    if (!connection) continue;
    for (const { sender, recipient, timestamp, message } of entry.messaging ?? []) {
      if (!message || message.is_echo || message.is_self || message.is_unsupported || recipient.id !== entry.id || sender.id === entry.id || timestamp > Date.now()) continue;
      await db.$transaction(async (tx) => {
        await lock(tx, "correspondent:" + connection.id + ":" + sender.id);
        const created = await tx.instagramEvent.createMany({ data: [{ messageId: message.mid, connectionId: connection.id }], skipDuplicates: true });
        if (!created.count) return;
        const lastInboundAt = new Date(timestamp);
        const correspondent = await tx.instagramCorrespondent.upsert({ where: { connectionId_scopedId: { connectionId: connection.id, scopedId: sender.id } },
          create: { connectionId: connection.id, scopedId: sender.id, lastInboundAt }, update: {} });
        if (correspondent.lastInboundAt < lastInboundAt) await tx.instagramCorrespondent.update({ where: { id: correspondent.id }, data: { lastInboundAt } });
        if (!correspondent.accountId) return;
        const account = await tx.creatorPlatformAccount.findUnique({ where: { id: correspondent.accountId } });
        if (!account) return;
        await lock(tx, "dm:" + account.creatorId);
        const previous = await tx.dMMessage.findFirst({ where: { accountId: account.id, sentAt: { lt: lastInboundAt }, status: { in: ["SENT", "MANUALLY_SENT"] },
          OR: [{ connectionId: connection.id }, { connectionId: null, method: "MANUAL", sender: connection.username }] }, orderBy: { sentAt: "desc" } });
        if (!previous) return;
        await tx.creator.update({ where: { id: account.creatorId }, data: { contactStatus: "REPLIED" } });
        await tx.dMStatusHistory.create({ data: { messageId: previous.id, status: "REPLIED", reason: "Meta 수신 웹훅" } });
      });
    }
  }
}
export async function correspondentUsername(connectionId: string, correspondentId: string, actorId: string) {
  const event = await db.instagramCorrespondent.findFirstOrThrow({ where: { id: correspondentId, connectionId, connection: { ownerId: actorId, disconnectedAt: null, expiresAt: { gt: new Date() } } }, include: { connection: true } });
  const { tokenCiphertext, instagramId } = event.connection;
  check(tokenCiphertext, "Instagram 재인증이 필요합니다.", 409);
  const url = graph(numericId.parse(event.scopedId));
  url.searchParams.set("fields", "username");
  const profile = z.object({ username: z.string().regex(/^[\w.]{1,30}$/) }).parse(await officialJson(url, { headers: bearer(decrypt(tokenCiphertext, instagramId)) }));
  return profile.username.toLowerCase();
}
