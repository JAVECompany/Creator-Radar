import Link from "next/link";
import { Binoculars } from "lucide-react";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { label } from "@/lib/labels";
import { isSupportedPlatform } from "@/lib/platforms";
import { providers } from "@/services/providers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Action, Field, Hidden, Input } from "@/components/ui/form";
import { Badge, Empty, Flash, PageTitle, Panel } from "@/components/ui/panel";
import { ManualProfile } from "@/components/manual-profile";

export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await adminPage();
  const presets = await db.searchPreset.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" } });
  const capabilities = Object.values(providers).map((provider) => provider.getProviderCapabilities());
  const logs = await db.providerRequestLog.findMany({ distinct: ["platform"], orderBy: { createdAt: "desc" } });
  return <>
    <PageTitle title="크리에이터 탐색" description="공식 API로 검색하거나 확인한 공개 프로필을 등록하세요." action={<Link href="/creators" className={buttonVariants()}>내부 DB 검색</Link>} />
    <Flash query={await searchParams} />
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Panel title="외부 SNS 검색" description="검색 결과는 작업 화면에서 확인할 수 있습니다." action={<Link href="/jobs" className={buttonVariants({ variant: "ghost" })}>작업 보기</Link>}>
        <Action action="discovery" next="/jobs" className="grid gap-4 p-5">
          <Field label="검색어 또는 Instagram 사용자명"><Input name="query" required maxLength={150} placeholder="패션, 코스프레, 또는 정확한 계정명" /></Field>
          <Field label="YouTube 지역 코드 (선택)"><Input name="country" pattern="[a-zA-Z]{2}" maxLength={2} placeholder="KR" /></Field>
          <fieldset className="grid gap-2"><legend className="mb-2 font-medium">검색 플랫폼</legend>{capabilities.map((capability) => {
            const disabled = !capability.configured || capability.approval || capability.search === "none";
            const last = logs.find((log) => log.platform === capability.platform);
            const status = capability.search === "none" ? "수동 검색만 가능" : capability.approval ? "승인·권한 필요" : !capability.configured ? "API 키 필요" : last ? label(last.status) : "키 설정됨 · 호출 미확인";
            return <label key={capability.platform} className="flex gap-2.5 rounded-lg border border-border p-3"><input name="platforms" type="checkbox" value={capability.platform} disabled={disabled} /><span className="min-w-0 flex-1"><span className="font-medium">{label(capability.platform)}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{capability.description}</span></span><span><Badge value={status} /></span></label>;
          })}</fieldset>
          <div><Button variant="primary" disabled={capabilities.every((c) => !c.configured || c.approval || c.search === "none")}><Binoculars size={16} />검색 작업 시작</Button></div>
        </Action>
      </Panel>
      <Panel title="저장한 검색 조건" description="내부 DB 검색에 저장한 프리셋입니다.">
        {presets.length ? <ul className="divide-y divide-border">{presets.map((preset) => {
          const query = new URLSearchParams();
          let retired = false;
          if (preset.filters && typeof preset.filters === "object" && !Array.isArray(preset.filters)) {
            for (const [key, value] of Object.entries(preset.filters)) {
              if (key === "platform" && Array.isArray(value)) {
                const supported = value.filter((item) => typeof item === "string" && isSupportedPlatform(item));
                supported.forEach((item) => query.append(key, String(item)));
                retired = value.length > 0 && supported.length === 0;
              } else if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
              else if (value != null) query.set(key, String(value));
            }
          }
          return <li key={preset.id} className="flex items-center justify-between gap-2 p-4">
            {retired ? <span className="text-muted-foreground">{preset.name} · 연동 종료</span> : <Link className="text-primary hover:underline" href={"/creators?" + query.toString()}>{preset.name}</Link>}
            <Action action="presetDelete" next="/discover"><Hidden value={preset.id} /><Button variant="ghost">삭제</Button></Action>
          </li>;
        })}</ul> : <Empty title="저장한 프리셋이 없습니다." description="전체 크리에이터 화면에서 필터를 저장할 수 있습니다." />}
      </Panel>
      <div id="manual" className="scroll-mt-6 xl:col-span-2"><Panel title="공개 프로필 수동 등록" description="Instagram, YouTube, TikTok의 공개 프로필 URL을 등록할 수 있습니다."><ManualProfile next="/discover#manual" /></Panel></div>
    </div>
  </>;
}
