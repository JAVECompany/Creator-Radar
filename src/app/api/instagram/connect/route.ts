import { requireAdmin, limit } from "@/lib/auth";
import { assertOrigin } from "@/lib/config";
import { safeError } from "@/lib/errors";
import { back } from "@/lib/http";
import { oauthStart } from "@/services/instagram";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const session = await requireAdmin();
    await limit("instagram-connect:" + session.userId, 10);
    return Response.redirect(await oauthStart(session.id), 303);
  } catch (error) { return back("/instagram", safeError(error).message, true); }
}
