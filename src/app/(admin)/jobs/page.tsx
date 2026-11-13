import Link from "next/link";
import { adminPage } from "@/lib/auth";
import { Flash, PageTitle, Panel } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";
import { JobsTable } from "@/components/jobs-table";

export default async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  return <>
    <PageTitle title="수집 및 분석 작업" description="최근 100개 작업의 진행률, 공급자 응답 및 처리 결과를 확인하세요." action={<Link href="/discover" className={buttonVariants()}>새 탐색</Link>} />
    <Flash query={await searchParams} />
    <Panel title="작업 이력"><JobsTable /></Panel>
  </>;
}
