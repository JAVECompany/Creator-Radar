import Link from "next/link";
import { adminPage } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hidden } from "@/components/ui/form";
import { Flash, PageTitle, Panel } from "@/components/ui/panel";
import { providers } from "@/services/providers";

function ImportProfile({ action, disabled, children }: { action: string; disabled?: boolean; children: React.ReactNode }) {
  return <form method="post" action="/api/connections" className="grid gap-2">
    <Hidden name="action" value={action} />{children}<div><Button disabled={disabled}>{action === "instagram" ? "탐색 인증 확인" : "연결 확인 및 프로필 저장"}</Button></div>
  </form>;
}

export default async function Connections({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  return <>
    <PageTitle title="SNS 연결" description="Instagram 탐색과 DM, Facebook 페이지 및 Threads 연결을 관리하세요." />
    <Flash query={await searchParams} />
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Instagram" description="Business Discovery 탐색과 프로페셔널 계정의 DM을 각각 연결합니다.">
        <div className="grid gap-3 p-5">
          <ImportProfile action="instagram" disabled={!providers.INSTAGRAM.getProviderCapabilities().configured}>
            <p className="text-xs text-muted-foreground">IG_DISCOVERY_TOKEN · IG_DISCOVERY_ACCOUNT_ID · META_GRAPH_VERSION</p>
          </ImportProfile>
          <div><Link className={buttonVariants({ variant: "primary" })} href="/instagram">Instagram DM 계정 연결</Link></div>
        </div>
      </Panel>
      <Panel title="Facebook" description="관리 권한을 받은 공개 Facebook 페이지를 불러옵니다.">
        <div className="p-5"><ImportProfile action="facebook" disabled={!providers.FACEBOOK.getProviderCapabilities().configured}>
          <p className="text-xs text-muted-foreground">FACEBOOK_PAGE_ID · FACEBOOK_PAGE_ACCESS_TOKEN · META_GRAPH_VERSION</p>
        </ImportProfile></div>
      </Panel>
      <Panel title="Threads" description="Threads 사용자 토큰으로 본인 프로필을 불러옵니다. 승인된 공개 프로필 조회는 탐색 화면에서 사용합니다.">
        <div className="p-5"><ImportProfile action="threads" disabled={!providers.THREADS.getProviderCapabilities().configured}>
          <p className="text-xs text-muted-foreground">THREADS_ACCESS_TOKEN</p>
        </ImportProfile></div>
      </Panel>
    </div>
  </>;
}
