import { limit, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import { ok } from "@/lib/http";

export async function GET() {
  try {
    const { user } = await requireAdmin();
    await limit("jobs:" + user.id, 90);
    return ok(await db.job.findMany({ take: 100, orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, progress: true, attempts: true, createdAt: true, result: true, error: true } }));
  } catch (error) { return apiError(error); }
}
