import { equals } from "@/lib/crypto";
import { apiError, check } from "@/lib/errors";
import { ok, params, readText } from "@/lib/http";
import { receiveInstagram } from "@/services/instagram";

export function GET(request: Request) {
  try {
    const query = params(request);
    const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;
    check(verify && query.get("hub.mode") === "subscribe" && equals(query.get("hub.verify_token") ?? "", verify), "웹훅 확인 토큰이 일치하지 않습니다.", 403);
    const challenge = query.get("hub.challenge");
    check(challenge && /^\d{1,32}$/.test(challenge), "잘못된 웹훅 확인값입니다.");
    return new Response(challenge);
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await receiveInstagram(await readText(request, 512_000), request.headers.get("x-hub-signature-256") ?? "");
    return ok(null);
  } catch (error) { return apiError(error); }
}
