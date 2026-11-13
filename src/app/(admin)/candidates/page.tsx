import Link from "next/link";
import { Download } from "lucide-react";
import { RecruitmentStage } from "@prisma/client";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Badge, Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";
import { OptionList, stages } from "@/components/filters";
import { CandidateForm } from "@/components/candidate-form";

export default async function Candidates({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const query = await searchParams;
  const stage = typeof query.stage === "string" && Object.hasOwn(RecruitmentStage, query.stage) ? query.stage as RecruitmentStage : undefined;
  const page = typeof query.page === "string" && /^\d{1,5}$/.test(query.page) ? Math.max(1, Number(query.page)) : 1;
  const where = { active: true, stage };
  const [items, total, admins] = await Promise.all([
    db.recruitmentCandidate.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
      include: { assignee: { select: { email: true } }, creator: { include: { tags: true, accounts: { select: { platform: true } } } } } }),
    db.recruitmentCandidate.count({ where }),
    db.user.findMany({ where: { active: true }, select: { id: true, email: true } }),
  ]);
  const href = (target: number) => "/candidates?page=" + target + (stage ? "&stage=" + stage : "");
  return <>
    <PageTitle title="영입 후보 관리" description="담당자, 영입 단계, 후속 연락일을 관리하세요." action={<a href="/api/candidates/export" className={buttonVariants()}><Download size={15} />후보 CSV</a>} />
    <Flash query={query} />
    <Panel title={"영입 후보 " + total + "명"}>
      <form action="/candidates" className="flex flex-wrap items-end gap-2 border-b border-border p-4"><Field label="영입 단계"><Select name="stage" defaultValue={stage ?? ""}><option value="">전체</option><OptionList values={stages} /></Select></Field><Button>조회</Button></form>
      {items.length ? <div className="divide-y divide-border">{items.map((item) => <details key={item.id} className="p-4">
        <summary><span className="inline-flex flex-wrap items-center gap-2"><Link href={"/creators/" + item.creatorId} className="font-semibold text-primary hover:underline">{item.creator.name}</Link><Badge value={item.stage} /><Badge value={item.creator.contactStatus} />
          <span className="text-xs text-muted-foreground">{item.assignee?.email ?? "담당자 미지정"} · 후속 연락 {formatDate(item.followUpAt)}</span>{item.creator.tags.map((tag) => <Badge key={tag.id} value={tag.name} />)}</span></summary>
        <div className="mt-3"><CandidateForm id={item.creatorId} candidate={item} admins={admins} next={href(page)} /></div>
      </details>)}</div> : <Empty title="영입 후보가 없습니다." action={<Link href="/creators" className={buttonVariants()}>전체 크리에이터</Link>} />}
      <div className="flex justify-end gap-2 border-t border-border p-4">{page > 1 && <Link href={href(page - 1)} className={buttonVariants()}>이전</Link>}{page * 25 < total && <Link href={href(page + 1)} className={buttonVariants()}>다음</Link>}</div>
    </Panel>
  </>;
}
