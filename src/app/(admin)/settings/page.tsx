import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { currentWeights } from "@/services/scoring";
import { Button } from "@/components/ui/button";
import { Action, Field, Hidden, Input, Select } from "@/components/ui/form";
import { Badge, Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";

const weightNames = { category: "콘텐츠 카테고리", activity: "최근 활동", engagement: "공개 참여 지표", scale: "계정 규모", business: "공개 협업 연락 정보" };
export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const [weights, platforms, recentAudit] = await Promise.all([
    currentWeights(),
    db.subscriptionPlatform.findMany({ orderBy: { name: "asc" }, include: { aliases: { orderBy: { value: "asc" } } } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const ai = process.env.AI_PROVIDER === "openai" && Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  return <>
    <PageTitle title="설정" description="적합도 가중치, 팬 구독 플랫폼 감지 규칙 및 감사 로그를 관리하세요." />
    <Flash query={await searchParams} />
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="영입 적합도 가중치" description="합계는 100%입니다. 다음 적합도 갱신 작업에 적용됩니다.">
        <Action action="weights" next="/settings" className="grid gap-3 p-5">
          {Object.entries(weights).map(([key, value]) => <Field key={key} label={weightNames[key as keyof typeof weightNames] + " (%)"}><Input type="number" name={key} min={0} max={100} defaultValue={value} required /></Field>)}
          <div><Button variant="primary">가중치 저장</Button></div>
        </Action>
      </Panel>
      <Panel title="AI 공개 콘텐츠 분석" description="검토가 완료된 공개 게시물의 입력 메타데이터로 주제를 분류합니다.">
        <div className="grid gap-3 p-5"><div><Badge value={ai ? "AI 설정됨 · 작업에서 호출 확인" : "AI 키 및 모델 필요"} tone={ai ? "green" : "amber"} /></div>
          <p className="text-sm text-muted-foreground">분석 어댑터와 모델은 서버 환경변수에서 관리합니다. 성인 확인, 콘텐츠 검토 및 게시물 근거는 크리에이터 상세에서 관리하세요.</p></div>
      </Panel>
      <Panel title="팬 구독 플랫폼 규칙" description="별칭 또는 정확한 호스트명을 등록하세요. 다음 검사 작업에 적용됩니다." className="xl:col-span-2">
        <Action action="subscription" next="/settings" className="grid items-end gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="플랫폼 이름"><Input name="name" required maxLength={120} list="fan-platforms" /></Field>
          <datalist id="fan-platforms">{platforms.map((platform) => <option key={platform.id} value={platform.name} />)}</datalist>
          <Field label="별칭 또는 호스트명"><Input name="value" required maxLength={120} /></Field>
          <Field label="규칙 종류"><Select name="domain"><option value="no">별칭</option><option value="yes">도메인</option></Select></Field>
          <Field label="모호한 일치"><Select name="ambiguous"><option value="no">확정</option><option value="yes">수동 검토</option></Select></Field>
          <div><Button>규칙 저장</Button></div>
        </Action>
        <div className="divide-y divide-border border-t border-border">{platforms.map((platform) => <div className="grid gap-2 px-5 py-4" key={platform.id}><strong>{platform.name}</strong><div className="flex flex-wrap gap-2">
          {platform.aliases.map((item) => <Action key={item.id} action="aliasDelete" next="/settings"><Hidden value={item.id} /><Button aria-label={item.value + " 규칙 삭제"}>{item.value} {item.ambiguous ? "· 검토" : ""} ×</Button></Action>)}
        </div></div>)}</div>
      </Panel>
      <Panel title="관리자 감사 로그" description="최근 20개 관리자 작업" className="xl:col-span-2">
        {recentAudit.length ? <ul className="divide-y divide-border">{recentAudit.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><Badge value={item.action} /><span className="text-xs text-muted-foreground">{item.actorId ?? "시스템"} · {formatDate(item.createdAt)}</span></li>)}</ul> : <Empty title="감사 기록이 없습니다." />}
      </Panel>
    </div>
  </>;
}
