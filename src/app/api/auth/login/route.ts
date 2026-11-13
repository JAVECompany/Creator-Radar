import { z } from "zod";
import { assertOrigin } from "@/lib/config";
import { limit, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchesPassword } from "@/lib/password";
import { check, safeError } from "@/lib/errors";
import { back, htmlForm } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await limit("login:global", 40, 60);
    const form = await htmlForm(request);
    const email = z.email().max(254).parse(String(form.get("email") ?? "").trim().toLowerCase());
    const password = z.string().min(1).max(256).parse(form.get("password"));
    await limit("login:" + email, 8, 300);
    const user = await db.user.findUnique({ where: { email } });
    const valid = await matchesPassword(password, user?.passwordHash);
    check(valid && user?.active, "이메일 또는 비밀번호를 확인하세요.", 401);
    await startSession(user.id);
    return back("/");
  } catch (error) { return back("/login", safeError(error).message, true); }
}
