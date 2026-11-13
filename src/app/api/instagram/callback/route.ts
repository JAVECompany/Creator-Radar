import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { back, params } from "@/lib/http";
import { oauthFinish } from "@/services/instagram";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const query = params(request);
    if (query.has("error")) return back("/instagram", "Instagram 인증이 취소되었습니다.", true);
    const state = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(query.get("state"));
    const code = z.string().min(1).max(4096).parse(query.get("code"));
    const connection = await oauthFinish(session.id, session.userId, state, code);
    return back("/instagram", connection.subscribed ? "계정과 메시지 웹훅을 연결했습니다." : "계정을 연결했습니다. 메시징 권한과 웹훅 설정을 확인하세요.");
  } catch (error) { return back("/instagram", safeError(error).message, true); }
}
