import { limit, requireAdmin } from "@/lib/auth";
import { apiError, check } from "@/lib/errors";
import { ok, params } from "@/lib/http";
import { label } from "@/lib/labels";
import { csv, directory, queryFilters } from "@/services/directory";

export async function GET(request: Request) {
  try {
    const { user } = await requireAdmin();
    const search = params(request);
    const mode = search.get("mode");
    await limit("directory:" + user.id, mode === "export" ? 10 : 90);
    const result = await directory(queryFilters(search), user.id, mode === "export" ? "export" : mode === "selection" ? "selection" : "page");
    if (mode === "selection") return ok({ total: result.total, ids: result.rows.length <= 100 ? result.rows.map(({ id, platform }) => ({ id, platform })) : [] });
    if (mode !== "export") return ok(result);
    check(result.total <= 10000, "CSV는 최대 10,000개 계정을 내보냅니다. 필터를 좁혀 주세요.", 422);
    const content = csv([["이름", "계정", "SNS", "프로필", "국가", "팔로워·구독자", "카테고리", "팬 구독 플랫폼", "적합도", "최근 활동", "DM 상태", "영입 상태", "수집 시각"],
      ...result.rows.map((r) => [r.name, r.handle, label(r.platform), r.profileUrl, r.country, r.followers, r.categories.map(label).join(" / "), r.fan.join(" / "), r.score, r.activity, label(r.dm), r.stage ? label(r.stage) : null, r.collectedAt])]);
    return new Response(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="creators.csv"', "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
