import { requireAdmin, limit } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, check } from "@/lib/errors";
import { csv } from "@/services/directory";
import { label } from "@/lib/labels";

export async function GET() {
  try {
    const { user } = await requireAdmin();
    await limit("candidate-export:" + user.id, 10);
    const data = await db.recruitmentCandidate.findMany({ where: { active: true }, include: { creator: { include: { tags: true } }, assignee: { select: { email: true } } }, take: 10001, orderBy: { updatedAt: "desc" } });
    check(data.length <= 10000, "후보 CSV는 최대 10,000건을 지원합니다.", 422);
    return new Response(csv([["이름", "단계", "담당자", "태그", "연락 상태", "후속 연락일"],
      ...data.map((row) => [row.creator.name, label(row.stage), row.assignee?.email ?? null, row.creator.tags.map((tag) => tag.name).join(", "), label(row.creator.contactStatus), row.followUpAt?.toISOString() ?? null])]),
    { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="candidates.csv"', "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
