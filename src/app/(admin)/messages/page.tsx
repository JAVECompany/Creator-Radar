import Link from "next/link";
import { DmStatus, type Prisma } from "@prisma/client";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { label } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Action, Field, Hidden, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Empty, Flash, LinkOut, PageTitle, Panel } from "@/components/ui/panel";
import { CopyMessage } from "@/components/composer";

export default async function Messages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const query = await searchParams;
  const selected = typeof query.status === "string" ? query.status : "";
  const page = typeof query.page === "string" && /^\d{1,5}$/.test(query.page) ? Math.max(1, Number(query.page)) : 1;
  const status = Object.hasOwn(DmStatus, selected) ? selected as DmStatus : undefined;
  const emptyContact = status === "NOT_CONTACTED";
  const where: Prisma.DMMessageWhereInput = selected === "sent" ? { status: { in: ["SENT", "MANUALLY_SENT"] } } :
    status === "REPLIED" || status === "FOLLOW_UP" ? { account: { creator: { contactStatus: status } } } : { status };
  const noContact = { platform: "INSTAGRAM", creator: { contactStatus: "NOT_CONTACTED" } } as const;
  const [messages, total, uncontacted] = await Promise.all([
    emptyContact ? [] : db.dMMessage.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
      include: { account: { include: { creator: true } }, template: { select: { name: true } }, history: { orderBy: { createdAt: "asc" }, take: 25 }, attempts: true } }),
    emptyContact ? db.creatorPlatformAccount.count({ where: noContact }) : db.dMMessage.count({ where }),
    emptyContact ? db.creatorPlatformAccount.findMany({ where: noContact, skip: (page - 1) * 25, take: 25, include: { creator: true }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const href = (target: number) => "/messages?page=" + target + (selected ? "&status=" + encodeURIComponent(selected) : "");
  return <>
    <PageTitle title="DM 전송 관리" description="대상별 메시지와 전송 결과를 확인하고 수동 연락을 기록하세요." action={<Link href="/compose" className={buttonVariants({ variant: "primary" })}>DM 작성</Link>} />
    <Flash query={query} />
    <Panel title={(emptyContact ? "미발송 계정 " : "메시지 ") + total + "건"}>
      <form action="/messages" className="flex flex-wrap items-end gap-2 border-b border-border p-4"><Field label="전송 상태"><Select name="status" defaultValue={selected}>
        <option value="">전체</option><option value="sent">전송 완료 (API·수동)</option>{Object.values(DmStatus).map((item) => <option key={item} value={item}>{label(item)}</option>)}
      </Select></Field><Button>조회</Button></form>
      {uncontacted.length > 0 && <ul className="divide-y divide-border">{uncontacted.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 p-4"><Link href={"/creators/" + item.creatorId} className="text-primary hover:underline">{item.creator.name} · @{item.handle}</Link><Link href={"/compose?ids=" + item.id} className={buttonVariants()}>작성</Link></li>)}</ul>}
      {!messages.length && !uncontacted.length && <Empty title="해당 상태의 DM 작업이 없습니다." />}
      <div className="divide-y divide-border">{messages.map((message) => {
        const delivered = ["SENT", "MANUALLY_SENT"].includes(message.status);
        const manual = message.method === "MANUAL" && ["DRAFT", "NOT_ELIGIBLE"].includes(message.status);
        const safeContact = message.account.creator.adultStatus === "VERIFIED" && message.account.creator.reviewStatus === "CLEARED";
        return <details key={message.id} className="p-4">
          <summary><span className="inline-flex flex-wrap items-center gap-2"><span className="font-semibold">{message.account.creator.name} · @{message.account.handle}</span><Badge value={message.status} />
            {message.uncertain && <Badge value="Meta 전송 확인 필요" tone="red" />}<span className="text-xs text-muted-foreground">{formatDate(message.requestedAt)}</span></span></summary>
          <div className="mt-3 grid gap-3">
            <p className="rounded-lg border border-border bg-[#13151e] p-3 whitespace-pre-wrap">{message.body}</p>
            <p className="text-sm text-muted-foreground">발신 {message.sender ? "@" + message.sender : "데이터 없음"} · 방식 {message.method === "API" ? "공식 API" : "수동"} · 성공 시각 {formatDate(message.sentAt)} · 템플릿 {message.template?.name ?? "데이터 없음"}</p>
            <p className="text-xs text-muted-foreground">메시지 ID {message.apiMessageId ?? "데이터 없음"} · 수신 {formatDate(message.deliveredAt)} · 읽음 {formatDate(message.readAt)} · 오류 {message.errorCode ?? "—"}</p>
            <p className="text-xs text-muted-foreground">캠페인 {message.campaignId ?? "—"} · 작업 {message.jobId ?? "—"} · 관리자 {message.actorId}</p>
            {message.attempts.length > 0 && <ul className="grid gap-1 text-xs text-muted-foreground">{message.attempts.map((attempt) => <li key={attempt.id}>
              전송 시도 {formatDate(attempt.startedAt)} · 종료 {formatDate(attempt.finishedAt)} · 결과 {attempt.outcome ? label(attempt.outcome) : "처리 중"}{attempt.errorCode ? " · " + attempt.errorCode : ""}
            </li>)}</ul>}
            <div className="flex flex-wrap items-center gap-3"><Link href={"/creators/" + message.account.creatorId} className="text-primary hover:underline">상세 보기</Link>
              {manual && safeContact && <><CopyMessage body={message.body} /><LinkOut url={message.account.profileUrl}>Instagram 프로필 열기</LinkOut></>}
              {message.status === "DRAFT" && safeContact && <Link className={buttonVariants()} href={"/compose?ids=" + message.accountId + "&draft=" + message.id + (message.followUpToId ? "&followUp=" + message.followUpToId : "")}>초안으로 새 전송 작업 작성</Link>}
              {delivered && <Link href={"/compose?ids=" + message.accountId + "&followUp=" + message.id} className={buttonVariants()}>후속 연락 작성</Link>}
            </div>
            {((manual && safeContact) || delivered || message.uncertain) && <Action action="dmRecord" next={href(page)} className="grid gap-2 rounded-lg border border-border p-3">
              <Hidden value={message.id} />
              {manual && safeContact && <Field label="실제 발신 Instagram 계정"><Input name="sender" defaultValue={message.sender ?? ""} placeholder="@계정명" maxLength={31} /></Field>}
              <Field label={message.uncertain ? "Meta에서 미전송을 확인한 근거" : "완료·답장 근거"}><Textarea name="evidence" required maxLength={2000} /></Field>
              <div className="flex flex-wrap gap-2">
                {manual && safeContact && <Button variant="primary" name="status" value="MANUALLY_SENT">실제 수동 발송 완료 기록</Button>}
                {delivered && <Button name="status" value="REPLIED">답장 수신 기록</Button>}
                {(manual || message.uncertain) && <Button name="status" value="FAILED">미전송 확인 후 종료</Button>}
              </div>
            </Action>}
            {message.history.length > 0 && <ul className="grid gap-1 text-xs text-muted-foreground">{message.history.map((item) => <li key={item.id}>{formatDate(item.createdAt)} · {label(item.status)} {item.reason ? "· " + item.reason : ""}</li>)}</ul>}
          </div>
        </details>;
      })}</div>
      <div className="flex justify-end gap-2 border-t border-border p-4">{page > 1 && <Link href={href(page - 1)} className={buttonVariants()}>이전</Link>}{page * 25 < total && <Link href={href(page + 1)} className={buttonVariants()}>다음</Link>}</div>
    </Panel>
  </>;
}
