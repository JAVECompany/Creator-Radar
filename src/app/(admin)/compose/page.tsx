import Link from "next/link";
import { z } from "zod";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { batchLimit } from "@/services/dm";
import { messagingScope } from "@/services/instagram";
import { Button, buttonVariants } from "@/components/ui/button";
import { Action, Field, Hidden, Input, Textarea } from "@/components/ui/form";
import { Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";
import { Composer } from "@/components/composer";

export default async function ComposePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await adminPage();
  const query = await searchParams;
  const idArray = z.array(z.uuid()).max(batchLimit).safeParse(typeof query.ids === "string" ? [...new Set(query.ids.split(","))] : []);
  const ids = idArray.success ? idArray.data : [];
  const follow = z.uuid().safeParse(query.followUp);
  const draft = z.uuid().safeParse(query.draft);
  const followUp = follow.success ? follow.data : undefined;
  const [targets, templates, connections, existingDraft] = await Promise.all([
    db.creatorPlatformAccount.findMany({ where: { id: { in: ids }, platform: "INSTAGRAM" }, select: { id: true, handle: true, creator: { select: { name: true } } } }),
    db.dMTemplate.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: "desc" } }),
    db.instagramConnection.findMany({ where: { ownerId: user.id, disconnectedAt: null }, select: { id: true, username: true, expiresAt: true, subscribed: true, scopes: true } }),
    draft.success ? db.dMMessage.findFirst({ where: { id: draft.data, actorId: user.id, status: "DRAFT", accountId: { in: ids } }, select: { body: true } }) : null,
  ]);
  return <>
    <PageTitle title="DM 작성 및 템플릿" description="메시지를 작성하고 수신자별 본문과 발송 자격을 확인하세요." action={<Link href="/messages" className={buttonVariants()}>DM 전송 관리</Link>} />
    <Flash query={query} />
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title={followUp ? "후속 연락 작성" : "Instagram DM 작성"}>
        {ids.length && targets.length === ids.length ? <Composer targets={targets.map(({ creator, ...target }) => ({ ...target, name: creator.name }))} templates={templates}
          connections={connections.map((connection) => ({ id: connection.id, username: connection.username, usable: connection.subscribed && connection.expiresAt > new Date() && connection.scopes.includes(messagingScope) }))}
          followUp={followUp} initialBody={existingDraft?.body} /> : <Empty title={idArray.success && !ids.length ? "선택한 수신자가 없습니다." : "선택한 계정을 모두 확인할 수 없습니다."} description="전체 크리에이터 목록에서 Instagram 계정을 선택하세요." action={<Link href="/creators?platform=INSTAGRAM" className={buttonVariants({ variant: "primary" })}>Instagram 계정 선택</Link>} />}
      </Panel>
      <Panel title="메시지 템플릿">
        <Action action="template" next="/compose" className="grid gap-3 p-4"><Field label="템플릿 이름"><Input name="name" required maxLength={120} /></Field>
          <Field label="템플릿 본문"><Textarea name="body" required maxLength={1000} /></Field><div><Button>템플릿 추가</Button></div>
        </Action>
        <div className="divide-y divide-border border-t border-border">{templates.map((item) => <details key={item.id} className="p-4">
          <summary className="font-semibold">{item.name}</summary>
          <Action action="template" next="/compose" className="mt-3 grid gap-2"><Hidden value={item.id} /><Field label="이름"><Input name="name" defaultValue={item.name} required maxLength={120} /></Field>
            <Field label="본문"><Textarea name="body" defaultValue={item.body} required maxLength={1000} /></Field><div><Button>수정</Button></div>
          </Action>
          <Action action="templateArchive" next="/compose" className="mt-2"><Hidden value={item.id} /><Button variant="danger">삭제</Button></Action>
        </details>)}</div>
      </Panel>
    </div>
  </>;
}
