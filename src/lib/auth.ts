import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { createHash } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./config";
import { check } from "./errors";

const ttl = 60 * 60 * 12;
export async function sessionCookie() {
  const password = process.env.SESSION_SECRET;
  check(password && password.length >= 32, "SESSION_SECRET을 설정해 주세요.", 503);
  const secure = appUrl().protocol === "https:";
  return getIronSession<{ id?: string }>(await cookies(), {
    cookieName: secure ? "__Host-radar" : "radar-dev",
    password, ttl, cookieOptions: { secure, httpOnly: true, sameSite: "lax", path: "/" },
  });
}
export async function auth() {
  const cookie = await sessionCookie();
  if (!cookie.id) return null;
  const session = await db.userSession.findUnique({ where: { id: cookie.id }, include: { user: { select: { id: true, active: true, email: true } } } });
  return session && session.expiresAt > new Date() && session.user.active ? session : null;
}
export async function requireAdmin() {
  const session = await auth();
  check(session, "로그인이 필요합니다.", 401);
  return session;
}
export async function adminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return session;
}
export async function startSession(userId: string) {
  const cookie = await sessionCookie();
  const session = await db.$transaction(async (tx) => {
    if (cookie.id) await tx.userSession.deleteMany({ where: { id: cookie.id } });
    const created = await tx.userSession.create({ data: { userId, expiresAt: new Date(Date.now() + ttl * 1000) } });
    await tx.auditLog.create({ data: { actorId: userId, action: "LOGIN" } });
    return created;
  });
  cookie.id = session.id;
  await cookie.save();
}
export async function endSession() {
  const cookie = await sessionCookie();
  if (cookie.id) await db.userSession.deleteMany({ where: { id: cookie.id } });
  cookie.destroy();
}
export async function limit(key: string, max: number, seconds = 60) {
  const now = Date.now();
  const window = Math.floor(now / (seconds * 1000));
  const id = createHash("sha256").update(key + ":" + window).digest("hex");
  const [bucket] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateBucket" ("key","count","expiresAt")
    VALUES (${id}, 1, ${new Date((window + 1) * seconds * 1000)})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateBucket"."count" + 1
    RETURNING "count"`;
  check(bucket.count <= max, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
}
