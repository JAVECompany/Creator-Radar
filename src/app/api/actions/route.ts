import { limit, requireAdmin } from "@/lib/auth";
import { assertOrigin } from "@/lib/config";
import { apiError, safeError } from "@/lib/errors";
import { back, htmlForm, json, ok } from "@/lib/http";
import { command, formPayload } from "@/services/commands";
import { z } from "zod";

export async function POST(request: Request) {
  const isJson = request.headers.get("content-type")?.startsWith("application/json");
  let next: unknown = "/";
  try {
    assertOrigin(request);
    const { user } = await requireAdmin();
    await limit("action:" + user.id, 90);
    if (isJson) {
      const data = z.object({ action: z.string().max(80), input: z.unknown() }).parse(await json(request));
      return ok(await command(data.action, data.input, user.id) ?? null);
    }
    const form = await htmlForm(request);
    next = form.get("_next");
    const action = String(form.get("_action") ?? "");
    const result = await command(action, formPayload(form, action), user.id);
    if (action === "profile" && result && "creatorId" in result) return back("/creators/" + result.creatorId, "프로필을 등록했습니다.");
    if (action === "discovery" && result && "reused" in result) return back(next, "같은 조건으로 등록한 검색 작업이 있습니다.");
    if (action === "instagramDisconnect" && result && "unsubscribed" in result && !result.unsubscribed)
      return back(next, "로컬 연결을 해제했습니다. Meta에서 앱 권한을 확인하세요.");
    return back(next, "저장했습니다.");
  } catch (error) {
    if (isJson) return apiError(error);
    const failure = safeError(error);
    return back(failure.status === 401 ? "/login" : next, failure.message, true);
  }
}
