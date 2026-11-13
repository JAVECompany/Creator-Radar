import { z } from "zod";
import { limit, requireAdmin } from "@/lib/auth";
import { assertOrigin } from "@/lib/config";
import { check, safeError } from "@/lib/errors";
import { back, htmlForm } from "@/lib/http";
import { saveProfile } from "@/services/collection";
import { providers } from "@/services/providers";
import { readFacebookPage } from "@/services/providers/facebook";
import { readThreadsAccount } from "@/services/providers/threads";
import { ProviderFailure } from "@/services/providers/types";

const action = z.enum(["facebook", "threads", "instagram"]);
const next = "/connections";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { userId } = await requireAdmin();
    await limit("social-connection:" + userId, 15);
    const form = await htmlForm(request);
    const kind = action.parse(form.get("action"));
    if (kind === "instagram") {
      const { status, reason } = await providers.INSTAGRAM.verifyDiscovery();
      check(status === "SUCCESS", reason ?? "Instagram 탐색 토큰과 계정 ID를 확인하세요.", 409);
      return back(next, "Instagram 탐색 계정과 토큰을 확인했습니다.");
    }
    const profile = await (kind === "facebook" ? readFacebookPage() : readThreadsAccount());
    check(await saveProfile(profile), "검토 보류 중인 계정입니다.", 409);
    return back(next, profile.name + " 계정을 확인하고 저장했습니다.");
  } catch (error) {
    return back(next, error instanceof ProviderFailure ? error.message : safeError(error).message, true);
  }
}
