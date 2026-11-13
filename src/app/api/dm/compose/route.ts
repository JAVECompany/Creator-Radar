import { z } from "zod";
import { limit, requireAdmin } from "@/lib/auth";
import { assertOrigin } from "@/lib/config";
import { apiError } from "@/lib/errors";
import { json, ok } from "@/lib/http";
import { composeDM, composeSchema, previewDM } from "@/services/dm";

const schema = z.object({ mode: z.enum(["preview", "confirm"]), input: composeSchema, confirmed: z.literal(true).optional(), approval: z.unknown().optional() })
  .refine((data) => data.mode === "preview" || data.confirmed, "최종 확인이 필요합니다.");
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user } = await requireAdmin();
    await limit("compose:" + user.id, 20);
    const { mode, input, approval } = schema.parse(await json(request));
    return ok(await (mode === "preview" ? previewDM(input, user.id) : composeDM(input, user.id, approval)));
  } catch (error) { return apiError(error); }
}
