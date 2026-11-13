import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ExternalLink, RefreshCw, Send } from "lucide-react";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { label } from "@/lib/labels";
import { isSupportedPlatform } from "@/lib/platforms";
import { formatCount, formatDate } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Action, Field, Hidden, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Empty, Flash, LinkOut, PageTitle, Panel } from "@/components/ui/panel";
import { OptionList } from "@/components/filters";
import { ManualProfile } from "@/components/manual-profile";
import { CandidateForm } from "@/components/candidate-form";
import { CountsChart } from "@/components/chart";

const scoringLabels: Record<string, string> = { category: "카테고리", activity: "최근 활동", engagement: "참여 지표", scale: "계정 규모", business: "협업 연락 정보" };
export default async function CreatorDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const next = "/creators/" + id;
  const [creator, admins] = await Promise.all([
    db.creator.findUnique({ where: { id }, include: {
      accounts: { orderBy: { createdAt: "asc" }, include: {
        contents: { orderBy: { collectedAt: "desc" }, take: 20 }, metrics: { orderBy: { capturedAt: "desc" }, take: 12 },
        subscriptions: { include: { platform: true, evidence: true } },
        analyses: { orderBy: { createdAt: "desc" }, take: 5, include: { evidence: true } },
        messages: { orderBy: { requestedAt: "desc" }, take: 15, include: { history: { orderBy: { createdAt: "asc" }, take: 25 } } },
      } }, tags: true, notes: { orderBy: { createdAt: "desc" }, take: 20 },
      candidate: { include: { activity: { orderBy: { createdAt: "desc" }, take: 15 } } },
    } }),
    db.user.findMany({ where: { active: true }, select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);
  if (!creator) notFound();
  const history = await db.job.findMany({ where: { OR: [
    { payload: { path: ["creatorId"], equals: id } },
    ...creator.accounts.map((account) => ({ payload: { path: ["accountId"], equals: account.id } })),
  ] }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, type: true, status: true, createdAt: true, error: true } });
  const scoreDetails = z.object({ metrics: z.record(z.string(), z.number().nullable()), weights: z.record(z.string(), z.number()),
    observedAt: z.array(z.object({ profile: z.string(), collectedAt: z.string().nullable() })).optional() }).safeParse(creator.scoreEvidence);
  const eligible = creator.adultStatus === "VERIFIED" && creator.reviewStatus === "CLEARED";
  return <>
    <Link href="/creators" className="mb-4 inline-flex items-center gap-2 text-muted-foreground hover:text-primary"><ArrowLeft size={15} />전체 크리에이터</Link>
    <PageTitle title={creator.name} description={[creator.country, creator.region].filter(Boolean).join(" · ") || "국가·지역 데이터 없음"} action={<div className="flex gap-2"><Badge value={creator.adultStatus} /><Badge value={creator.contactStatus} /></div>} />
    <Flash query={await searchParams} />
    <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <div className="grid content-start gap-4">
        {creator.accounts.map((account) => {
          const expired = account.expiresAt !== null && account.expiresAt <= new Date();
          const supported = isSupportedPlatform(account.platform);
          return <Panel key={account.id} title={label(account.platform) + " · " + account.handle} description={label(account.source) + " · 마지막 수집 " + formatDate(account.collectedAt)}
            action={<div className="flex flex-wrap gap-2"><LinkOut url={account.profileUrl}><span className="inline-flex items-center gap-1">프로필 <ExternalLink size={14} /></span></LinkOut>
              {account.platform === "INSTAGRAM" && <Link href={"/compose?ids=" + account.id} className={buttonVariants()}><Send size={14} />DM 작성</Link>}</div>}>
            <div className="grid gap-4 p-5">
              <div className="flex flex-wrap gap-2"><Badge value={account.analysisStatus} /><Badge value={account.detectionStatus} /><span className="self-center text-sm text-muted-foreground">팔로워·구독자 {formatCount(expired ? null : account.followers)} · 활동 {formatDate(expired ? null : account.lastActiveAt)}</span></div>
              {account.platform === "INSTAGRAM" && <p className="text-xs text-muted-foreground">수신 프로필 연결용 계정 ID <code>{account.id}</code></p>}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{expired ? "공급자 데이터 갱신 필요" : account.bio || "공개 프로필 소개 데이터 없음"}</p>
              {!expired && account.links.map((url) => <LinkOut key={url} url={url}>{url}</LinkOut>)}
              {supported && <div className="flex flex-wrap gap-2">
                {(["REFRESH", "METRICS", "SUBSCRIPTIONS", "ANALYSIS"] as const).map((type) => <Action key={type} action="job" next={next}><Hidden value={account.id} /><Hidden name="type" value={type} /><Button disabled={type === "ANALYSIS" && !eligible}><RefreshCw size={13} />{label(type)}</Button></Action>)}
              </div>}
              <details><summary className="font-semibold">팬 구독 플랫폼 근거</summary><div className="mt-2 grid gap-2 text-sm">
                <p className="text-muted-foreground">검사 시각 {formatDate(account.detectedAt)}</p>
                {account.subscriptions.map((item) => <div key={item.id} className="rounded-lg border border-border p-3"><strong>{item.platform.name}</strong>{item.evidence.map((evidence) =>
                  <p key={evidence.id} className="mt-1"><LinkOut url={evidence.url}>{evidence.matched}</LinkOut>{evidence.ambiguous ? " · 수동 검토" : ""}</p>)}
                  {supported && item.evidence.length > 0 && item.evidence.every((evidence) => evidence.ambiguous) && <Action action="subscriptionReview" next={next} className="mt-2 flex gap-2">
                    <Hidden value={item.id} /><Button name="decision" value="confirm">일치 확인</Button><Button name="decision" value="dismiss">일치 해제</Button>
                  </Action>}
                </div>)}
              </div></details>
              <details><summary className="font-semibold">공개 게시물 및 AI 분석</summary><div className="mt-3 grid gap-3">
                {eligible && !expired && account.contents.length ? <ul className="grid gap-1 text-sm">{account.contents.map((content) => <li key={content.id}><LinkOut url={content.url}>{content.title ?? content.url}</LinkOut><span className="ml-2 text-xs text-muted-foreground">{label(content.source)} · {formatDate(content.publishedAt ?? content.collectedAt)}</span></li>)}</ul> : <p className="text-muted-foreground">표시할 게시물 데이터 없음</p>}
                {eligible && account.analyses.map((analysis) => <div key={analysis.id} className="grid gap-2 rounded-lg border border-border p-3"><div className="flex flex-wrap items-center gap-2"><Badge value={analysis.status} /><span>{analysis.model} · {formatDate(analysis.createdAt)}</span>{analysis.manuallyReviewed && <Badge value="수동 검토 완료" />}</div>
                  {analysis.evidence.map((evidence) => <p key={evidence.id}><LinkOut url={evidence.url}>{label(evidence.category)}</LinkOut> · {(evidence.confidence * 100).toFixed(0)}%</p>)}
                  {supported && analysis.status === "COMPLETED" && !analysis.manuallyReviewed && <Action action="analysisReview" next={next}><Hidden value={account.id} /><Hidden name="analysisId" value={analysis.id} /><Button>검토 완료 기록</Button></Action>}
                </div>)}
                {supported && eligible && <Action action="content" next={next} className="grid gap-2 rounded-lg border border-border p-3">
                  <Hidden value={account.id} /><Field label="공개 게시물 URL"><Input name="url" type="url" required maxLength={2048} /></Field>
                  <Field label="제목 또는 중립적인 주제 설명"><Input name="title" required maxLength={120} /></Field>
                  <Field label="분석용 공개 메타데이터"><Textarea name="description" maxLength={2000} /></Field>
                  <label className="flex items-center gap-2"><input name="approved" value="yes" type="checkbox" required />공개 범위, 적법성, 동의 및 메타데이터 사용 권한을 확인했습니다.</label>
                  <div><Button>검토한 게시물 등록</Button></div>
                </Action>}
              </div></details>
              <details><summary className="font-semibold">팔로워·구독자 변화</summary>
                {!expired && account.metrics.some((item) => item.followers !== null) ? <CountsChart data={account.metrics.filter((item) => item.followers !== null).toReversed().map((item) => ({ name: item.capturedAt.toISOString().slice(5, 10), total: Number(item.followers) }))} /> : <p className="mt-2 text-muted-foreground">데이터 없음</p>}
                {supported && account.source === "MANUAL" && <Action action="publicMetrics" next={next} className="mt-3 grid gap-2 rounded-lg border border-border p-3">
                  <Hidden value={account.id} /><Field label="공개 지표 근거 URL"><Input name="evidence" type="url" required maxLength={2048} /></Field>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="팔로워·구독자"><Input name="followers" inputMode="numeric" pattern="[0-9]{1,18}" /></Field>
                    <Field label="공개 참여율 (%)"><Input name="engagement" type="number" min="0" max="100" step="0.01" /></Field>
                    <Field label="최근 활동일"><Input name="activity" type="date" /></Field>
                  </div><div><Button>공개 지표 기록</Button></div>
                </Action>}
              </details>
              {account.platform === "INSTAGRAM" && <details><summary className="font-semibold">최근 DM 이력</summary><div className="mt-2 grid gap-2">
                {account.messages.length ? account.messages.map((message) => <div key={message.id} className="grid gap-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap gap-2"><Badge value={message.status} /><span className="text-muted-foreground">{formatDate(message.requestedAt)}</span></div>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  {message.history.map((item) => <p key={item.id} className="text-xs text-muted-foreground">{formatDate(item.createdAt)} · {label(item.status)} {item.reason ? "· " + item.reason : ""}</p>)}
                </div>) : <p className="text-muted-foreground">데이터 없음</p>}
                <Link href="/messages" className="text-primary hover:underline">DM 전송 관리</Link>
              </div></details>}
            </div>
          </Panel>;
        })}
        <details className="rounded-xl border border-border bg-card"><summary className="p-5 font-semibold">다른 SNS 계정 연결</summary><ManualProfile creatorId={id} next={next} /></details>
        <Panel title="데이터 수집 이력">
          {history.length ? <ul className="divide-y divide-border">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3"><Badge value={item.status} /><span>{label(item.type)}</span><span className="text-xs text-muted-foreground">{formatDate(item.createdAt)} {item.error}</span></li>)}</ul> : <Empty title="수집 이력이 없습니다." />}
        </Panel>
      </div>
      <div className="grid content-start gap-4">
        <Panel title="성인 여부 및 콘텐츠 검토" description="외모나 게시물에 근거한 나이 추정 없이 확인할 수 있는 공개 근거를 기록하세요.">
          <Action action="review" next={next} className="grid gap-3 p-5"><Hidden value={id} />
            <div className="grid gap-2 sm:grid-cols-2"><Field label="성인 여부"><Select name="adultStatus" defaultValue={creator.adultStatus}><OptionList values={["UNVERIFIED", "VERIFIED", "EXCLUDED"]} /></Select></Field>
              <Field label="콘텐츠 검토"><Select name="reviewStatus" defaultValue={creator.reviewStatus}><OptionList values={["PENDING", "CLEARED", "HOLD"]} /></Select></Field></div>
            <Field label="공개 확인 근거 URL"><Input name="evidence" type="url" defaultValue={creator.adultEvidence ?? ""} maxLength={2048} /></Field>
            <Field label="공개 협업 연락 정보"><Select name="business" defaultValue={creator.businessContact == null ? "unknown" : creator.businessContact ? "yes" : "no"}><option value="unknown">확인불가</option><option value="yes">확인됨</option><option value="no">해당없음</option></Select></Field>
            <div className="flex flex-wrap items-center gap-2"><Button variant="primary">검토 저장</Button><span className="text-xs text-muted-foreground">{formatDate(creator.adultVerifiedAt)}</span></div>
          </Action>
        </Panel>
        <Panel title="영입 적합도" description="관리자 검토 및 사용 가능한 공개 지표로 계산한 자체 점수입니다."><div className="grid gap-2 p-5">
          <strong className="text-2xl">{creator.score ?? "데이터 없음"}</strong><p className="text-xs text-muted-foreground">{formatDate(creator.scoredAt)}</p>
          {scoreDetails.success && Object.entries(scoringLabels).map(([key, name]) => <p key={key} className="flex justify-between border-b border-border py-1.5 text-sm"><span>{name} · 가중치 {scoreDetails.data.weights[key]}%</span><span>{scoreDetails.data.metrics[key]?.toFixed(1) ?? "결측"}</span></p>)}
          {scoreDetails.success && scoreDetails.data.observedAt?.map((metric) => <p key={metric.profile} className="text-xs text-muted-foreground"><LinkOut url={metric.profile}>지표 출처</LinkOut> · {formatDate(metric.collectedAt)}</p>)}
          <Action action="job" next={next}><Hidden value={id} /><Hidden name="type" value="SCORE" /><Button>점수 갱신</Button></Action>
        </div></Panel>
        <Panel title="영입 후보"><div className="grid gap-3 p-5"><CandidateForm id={id} candidate={creator.candidate} admins={admins} next={next} />
          {creator.candidate?.activity.map((item) => <p key={item.id} className="text-xs text-muted-foreground">{formatDate(item.createdAt)} · {label(item.stage)} {item.action === "REMOVE" ? "· 후보 해제" : ""}</p>)}
        </div></Panel>
        <Panel title="메모 및 태그"><div className="grid gap-3 p-5">
          <Action action="note" next={next} className="grid gap-2"><Hidden value={id} /><Field label="관리자 메모"><Textarea name="body" required maxLength={2000} /></Field><div><Button>메모 저장</Button></div></Action>
          {creator.notes.map((item) => <div key={item.id} className="rounded-lg border border-border p-3"><p className="whitespace-pre-wrap">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}</p></div>)}
          <Action action="tag" next={next} className="flex gap-2"><Hidden value={id} /><Input aria-label="태그 이름" name="name" placeholder="태그 추가" required maxLength={40} /><Button>추가</Button></Action>
          <div className="flex flex-wrap gap-1">{creator.tags.map((tag) => <Action key={tag.id} action="tag" next={next}><Hidden value={id} /><Hidden name="name" value={tag.name} /><Hidden name="remove" value="yes" /><Button aria-label={tag.name + " 태그 제거"}>{tag.name} ×</Button></Action>)}</div>
        </div></Panel>
        <details className="rounded-xl border border-[#623b49] p-4"><summary className="text-danger">개인정보 삭제 요청 처리</summary>
          <Action action="erase" next="/creators" className="mt-3 grid gap-3"><Hidden value={id} /><p className="text-sm text-muted-foreground">저장한 프로필과 관련 연락·분석 이력을 영구 삭제합니다. 원본 SNS에는 영향을 주지 않습니다.</p>
            <Field label="삭제 사유"><Input name="reason" required maxLength={2000} /></Field><Field label="확인 문구 DELETE"><Input name="confirmed" pattern="DELETE" required /></Field><div><Button variant="danger">개인정보 영구 삭제</Button></div>
          </Action>
        </details>
      </div>
    </div>
  </>;
}
