import { endSession } from "@/lib/auth";
import { assertOrigin } from "@/lib/config";
import { apiError } from "@/lib/errors";
import { back } from "@/lib/http";

export async function POST(request: Request) {
  try { assertOrigin(request); await endSession(); return back("/login"); }
  catch (error) { return apiError(error); }
}
