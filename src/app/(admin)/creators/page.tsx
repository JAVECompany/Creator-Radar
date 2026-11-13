import Link from "next/link";
import { Plus } from "lucide-react";
import { adminPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { directory, filtersSchema, queryFilters } from "@/services/directory";
import { Button, buttonVariants } from "@/components/ui/button";
import { Action, Input } from "@/components/ui/form";
import { Flash, PageTitle, Panel } from "@/components/ui/panel";
import { DirectoryFilter } from "@/components/filters";
import { DirectoryTable } from "@/components/directory-table";

export default async function Creators({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await adminPage();
  const query = await searchParams;
  let params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (["error", "notice"].includes(key)) continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) params.append(key, item);
  }
  let invalid = false;
  let filters = filtersSchema.parse({});
  try { filters = queryFilters(params); } catch { invalid = true; params = new URLSearchParams(); }
  const [data, rules] = await Promise.all([directory(filters, user.id), db.subscriptionPlatform.findMany({ orderBy: { name: "asc" } })]);
  const filtersPath = "/creators?" + params.toString();
  const fans = [...new Set(["OnlyFans", "Fantrie", "Patreon", "Likey", ...rules.map((item) => item.name)])];
  return <>
    <PageTitle title="전체 크리에이터" description="등록된 SNS 계정을 검색하고 영입 후보를 검토하세요." action={<Link href="/discover#manual" className={buttonVariants({ variant: "primary" })}><Plus size={16} />프로필 등록</Link>} />
    <Flash query={invalid ? { error: "일부 검색 조건이 올바르지 않습니다." } : query} />
    <div className="grid gap-4">
      <Panel title="내부 DB 검색" action={<Link href="/discover" className={buttonVariants({ variant: "ghost" })}>외부 SNS 탐색</Link>}>
        <DirectoryFilter filters={filters} fans={fans} />
        <Action action="preset" next={filtersPath} className="flex flex-wrap gap-2 border-t border-border p-4">
          {Array.from(params).filter(([key]) => !["page", "sort", "dir", "name"].includes(key)).map(([key, value], index) => <input key={index} type="hidden" name={key} value={value} />)}
          <Input className="w-52" name="name" aria-label="프리셋 이름" placeholder="프리셋 이름" required maxLength={120} /><Button>현재 필터 저장</Button>
        </Action>
      </Panel>
      <Panel><DirectoryTable {...data} key={selectionKey(params)} query={params.toString()} sort={filters.sort} dir={filters.dir} /></Panel>
    </div>
  </>;
}

function selectionKey(query: URLSearchParams) {
  const filters = new URLSearchParams(query);
  for (const key of ["page", "sort", "dir"]) filters.delete(key);
  filters.sort();
  return filters.toString();
}
