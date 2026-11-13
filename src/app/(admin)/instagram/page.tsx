import { Instagram } from "lucide-react";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { instagramConfigured, messagingScope } from "@/services/instagram";
import { Button } from "@/components/ui/button";
import { Action, Field, Hidden, Input } from "@/components/ui/form";
import { Badge, Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";

export default async function InstagramPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await adminPage();
  const connections = await db.instagramConnection.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" },
    select: { id: true, username: true, scopes: true, disconnectedAt: true, subscribed: true, expiresAt: true, createdAt: true,
      correspondents: { orderBy: { lastInboundAt: "desc" }, take: 25, select: { id: true, lastInboundAt: true, accountId: true, account: { select: { handle: true } } } } } });
  return <>
    <PageTitle title="Instagram 계정 연결" description="관리 권한이 있는 프로페셔널 계정을 Meta OAuth로 연결하세요."
      action={<form method="post" action="/api/instagram/connect"><Button variant="primary" disabled={!instagramConfigured()}><Instagram size={16} />계정 연결 · 재인증</Button></form>} />
    <Flash query={await searchParams} />
    <div className="grid gap-4">
      <Panel title="연결 상태" description="공식 API 발송은 메시징 권한과 유효한 수신 메시지에 근거합니다.">
        {!instagramConfigured() && <p className="border-b border-border p-4 text-sm text-muted-foreground">Meta 앱 ID, 시크릿, Graph API 버전 및 HTTPS 콜백을 설정하세요. 현재 수동 발송 작업을 관리할 수 있습니다.</p>}
        {connections.length ? <div className="divide-y divide-border">{connections.map((item) => {
          const expired = item.expiresAt <= new Date();
          const enabled = !expired && item.scopes.includes(messagingScope) && item.subscribed && !item.disconnectedAt;
          return <div key={item.id} className="grid gap-3 p-4"><div className="flex flex-wrap items-center gap-2">
            <strong>@{item.username}</strong><Badge value={item.disconnectedAt ? "연결 해제됨" : expired ? "재인증 필요" : enabled ? "메시징 연결 확인" : "메시징 권한·웹훅 확인 필요"} tone={enabled ? "green" : "amber"} />
            <span className="text-xs text-muted-foreground">토큰 만료 {formatDate(item.expiresAt)}</span>
            {!item.disconnectedAt && <Action action="instagramDisconnect" next="/instagram" className="ml-auto"><Hidden value={item.id} /><Button variant="danger">연결 해제</Button></Action>}
          </div>
          {enabled && <details><summary className="text-sm font-semibold">최근 수신 메시지와 프로필 연결</summary>
            <div className="mt-2 grid gap-2">{item.correspondents.map((correspondent) => <div key={correspondent.id} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">마지막 수신 {formatDate(correspondent.lastInboundAt)} · {correspondent.account ? "@" + correspondent.account.handle : "미연결 " + correspondent.id.slice(0, 8)}</p>
              <Action action="correspondent" next="/instagram" className="mt-2 flex flex-wrap items-end gap-2"><Hidden value={correspondent.id} /><Hidden name="connectionId" value={item.id} />
                <Field label="등록된 Instagram 계정 ID"><Input name="accountId" defaultValue={correspondent.accountId ?? ""} required maxLength={36} /></Field><Button>Meta 사용자명 확인 및 연결</Button>
              </Action>
            </div>)}
            {!item.correspondents.length && <p className="text-muted-foreground">확인된 수신 메시지가 없습니다.</p>}</div>
          </details>}
          </div>;
        })}</div> : <Empty title="연결된 Instagram 계정이 없습니다." />}
      </Panel>
    </div>
  </>;
}
