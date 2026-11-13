import Link from "next/link";
import { ArrowUpRight, Binoculars, CheckCheck, ContactRound, MessageCircle, Sparkles, UsersRound } from "lucide-react";
import { adminPage } from "@/lib/auth";
import { label } from "@/lib/labels";
import { formatCount } from "@/lib/utils";
import { dashboard } from "@/services/dashboard";
import { platforms } from "@/services/collection";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";
import { CountsChart } from "@/components/chart";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const data = await dashboard();
  const stages = data.stages.reduce((total, stage) => total + stage._count._all, 0);
  const count = (status: string) => data.statuses.find((row) => row.contactStatus === status)?._count._all ?? 0;
  const detection = (status: string) => data.detections.find((row) => row.detectionStatus === status)?._count._all ?? 0;
  const stats = [
    { title: "전체 크리에이터", number: data.total, icon: UsersRound, desc: "최근 7일 +" + formatCount(data.fresh), href: "/creators" },
    { title: "AI 분석 완료", number: data.analyzed, icon: Sparkles, desc: "분석 완료 크리에이터", href: "/creators?analysis=COMPLETED" },
    { title: "영입 후보", number: stages, icon: ContactRound, desc: "활성 후보", href: "/candidates" },
    { title: "DM 전송 완료", number: data.sent, icon: CheckCheck, desc: "API 및 수동 발송", href: "/messages?status=sent" },
  ];
  return <>
    <PageTitle title="대시보드" description="크리에이터 수집과 영입 진행 상황을 확인하세요." action={<Link href="/discover" className={buttonVariants({ variant: "primary" })}><Binoculars size={16} />크리에이터 탐색</Link>} />
    <Flash query={await searchParams} />
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ title, number, icon: Icon, desc, href }) => <Link key={title} href={href} className="rounded-xl border border-border bg-card p-4 transition hover:border-[#595279]">
      <div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-[#292640] text-primary"><Icon size={17} /></span><ArrowUpRight size={15} className="text-[#87899f]" /></div>
      <div className="mt-4 text-sm text-muted-foreground">{title}</div><div className="mt-1 text-3xl font-semibold tabular-nums">{formatCount(number)}</div><p className="mt-2 text-xs text-muted-foreground">{desc}</p>
    </Link>)}</div>
    <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1.55fr_1fr]">
      <Panel title="SNS별 계정" description="플랫폼별로 등록된 계정 수"><CountsChart data={platforms.map((platform) => ({ name: label(platform), total: data.social.find((item) => item.platform === platform)?._count._all ?? 0 }))} /></Panel>
      <Panel title="DM 진행 현황" action={<Link href="/messages" className={buttonVariants({ variant: "ghost" })}><MessageCircle size={15} />전송 관리</Link>}>
        <div className="grid gap-2 p-4">{["NOT_CONTACTED", "FAILED", "REPLIED", "FOLLOW_UP"].map((status) => <div key={status} className="flex items-center justify-between rounded-lg bg-[#141620] px-3 py-2"><Badge value={status} /><span className="tabular-nums">{formatCount(count(status))}</span></div>)}</div>
      </Panel>
      <Panel title="팬 구독 플랫폼" description="플랫폼별 크리에이터를 집계하며 복수 분류는 중복 집계합니다.">
        {data.fan.length ? <CountsChart data={data.fan} /> : <Empty title="감지된 팬 구독 플랫폼이 없습니다." />}
        <div className="grid grid-cols-2 gap-2 border-t border-border p-4 text-sm"><span>해당없음 계정 <strong>{detection("NONE")}</strong></span><span>확인불가 계정 <strong>{detection("UNKNOWN")}</strong></span></div>
      </Panel>
      <Panel title="영입 단계"><div className="grid gap-2 p-4">{data.stages.length ? data.stages.map((stage) => <div key={stage.stage} className="flex justify-between"><Badge value={stage.stage} /><span>{stage._count._all}</span></div>) : <Empty title="등록된 영입 후보가 없습니다." />}</div></Panel>
      <Panel title="공개 콘텐츠 카테고리" description="검토된 성인 계정만 집계하며 복수 카테고리를 허용합니다.">
        {data.categories.length ? <CountsChart data={data.categories.map((item) => ({ ...item, name: label(item.name) }))} /> : <Empty title="분류된 공개 콘텐츠가 없습니다." />}
      </Panel>
    </div>
  </>;
}
