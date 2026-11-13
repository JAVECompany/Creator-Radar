import Link from "next/link";
import type { Filters } from "@/services/directory";
import { label } from "@/lib/labels";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/form";

const options = {
  platform: ["INSTAGRAM", "YOUTUBE", "TIKTOK", "NAVER_BLOG"],
  category: ["COSPLAY", "FASHION", "MODEL", "SWIMWEAR", "LINGERIE", "BODY_PROFILE", "ART_NUDE", "ADULT_ORIENTED_TEXT", "OTHER"],
  analysis: ["PENDING", "COMPLETED", "REVIEW", "FAILED"],
  stage: ["CANDIDATE", "REVIEWING", "CONTACT_READY", "CONTACTED", "REPLIED", "INTERESTED", "DEMO", "APPLIED", "APPROVED", "REJECTED"],
  dm: ["NOT_CONTACTED", "DRAFT", "QUEUED", "SENDING", "SENT", "MANUALLY_SENT", "FAILED", "NOT_ELIGIBLE", "REPLIED", "FOLLOW_UP"],
};
export const stages = options.stage;
export const platformOptions = options.platform;
export function OptionList({ values }: { values: string[] }) { return <>{values.map((value) => <option value={value} key={value}>{label(value)}</option>)}</>; }
export function FilterFields({ filters, fans }: { filters: Filters; fans: string[] }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="검색어"><Input name="q" defaultValue={filters.q} placeholder="이름, 계정명, 프로필 URL" maxLength={160} /></Field>
      <Field label="팬 구독 플랫폼"><Select name="fan" defaultValue={filters.fan ?? ""}><option value="">전체</option><OptionList values={fans} /><option value="none">해당없음</option><option value="unknown">확인불가</option><option value="review">검토 필요</option></Select></Field>
      <Field label="국가"><Input name="country" defaultValue={filters.country} maxLength={80} /></Field>
      <Field label="지역"><Input name="region" defaultValue={filters.region} maxLength={80} /></Field>
    </div>
    <fieldset className="flex flex-wrap gap-x-5 gap-y-2"><legend className="mb-2 font-medium">SNS 플랫폼</legend>{options.platform.map((platform) => <label key={platform} className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" name="platform" value={platform} defaultChecked={filters.platform.includes(platform as Filters["platform"][number])} />{label(platform)}</label>)}</fieldset>
    <details className="rounded-lg border border-border p-3" open={Boolean(filters.category || filters.analysis || filters.stage || filters.dm || filters.min || filters.max || filters.activity || filters.engagement)}>
      <summary className="text-sm font-medium">상세 필터</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["category", "analysis", "stage", "dm"] as const).map((name, index) => <Field key={name} label={["카테고리", "AI 분석 상태", "영입 상태", "DM 상태"][index]}><Select name={name} defaultValue={filters[name] ?? ""}><option value="">전체</option><OptionList values={options[name]} /></Select></Field>)}
        <Field label="최소 팔로워·구독자"><Input name="min" type="number" min="0" defaultValue={filters.min} /></Field>
        <Field label="최대 팔로워·구독자"><Input name="max" type="number" min="0" defaultValue={filters.max} /></Field>
        <Field label="최근 활동 일수"><Input name="activity" type="number" min="1" max="3650" defaultValue={filters.activity} /></Field>
        <Field label="최소 참여율 (%)"><Input name="engagement" type="number" step="0.01" min="0" max="100" defaultValue={filters.engagement} /></Field>
      </div>
    </details>
  </>;
}
export function DirectoryFilter({ filters, fans }: { filters: Filters; fans: string[] }) {
  return <form action="/creators" className="grid gap-4 p-4"><FilterFields filters={filters} fans={fans} /><div><Button variant="primary">검색</Button><Link className="ml-3 text-sm text-muted-foreground hover:text-foreground" href="/creators">초기화</Link></div></form>;
}
