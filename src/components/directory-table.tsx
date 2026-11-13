"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Columns3, Download, ExternalLink, Send, UserRound } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import type { DirectoryRow } from "@/services/directory";
import { label } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { Button, buttonVariants } from "./ui/button";
import { Badge, Empty } from "./ui/panel";
import { requestData } from "./query-provider";

type Picked = { id: string; platform: string };
type Props = { rows: DirectoryRow[]; total: number; page: number; pageSize: number; query: string; sort: string; dir: string };
const placeholder = "—";
const columns: ColumnDef<DirectoryRow>[] = [
  { accessorKey: "avatarUrl", header: "이미지", cell: ({ row }) => <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-[#282a3a] text-muted-foreground">{row.original.avatarUrl ?
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="size-8 object-cover" src={row.original.avatarUrl} referrerPolicy="no-referrer" loading="lazy" /> : <UserRound size={15} />}</span> },
  { accessorKey: "name", header: "크리에이터", cell: ({ row }) => <Link href={"/creators/" + row.original.creatorId} className="font-semibold text-primary hover:underline">{row.original.name}</Link> },
  { accessorKey: "handle", header: "계정명" }, { accessorKey: "platform", header: "SNS", cell: ({ row }) => <Badge value={row.original.platform} /> },
  { accessorKey: "profileUrl", header: "프로필", cell: ({ row }) => <a aria-label="공개 프로필 열기" href={row.original.profileUrl} target="_blank" rel="noopener noreferrer" className="text-primary"><ExternalLink size={15} /></a> },
  { accessorKey: "country", header: "국가", cell: ({ row }) => row.original.country ?? placeholder },
  { accessorKey: "followers", header: "팔로워·구독자", cell: ({ row }) => row.original.followers === null ? placeholder : BigInt(row.original.followers).toLocaleString("ko-KR") },
  { accessorKey: "categories", header: "콘텐츠 카테고리", cell: ({ row }) => row.original.categories.length ? row.original.categories.map(label).join(", ") : placeholder },
  { accessorKey: "fan", header: "팬 구독 플랫폼", cell: ({ row }) => row.original.fan.length ? row.original.fan.join(", ") : label(row.original.detection) },
  { accessorKey: "score", header: "적합도", cell: ({ row }) => row.original.score ?? placeholder },
  { accessorKey: "activity", header: "최근 활동", cell: ({ row }) => formatDate(row.original.activity) },
  { accessorKey: "apiEligible", header: "DM 자격", cell: ({ row }) => row.original.platform !== "INSTAGRAM" ? placeholder : row.original.apiEligible ? "API 가능" : "API 불가" },
  { accessorKey: "dm", header: "DM 상태", cell: ({ row }) => <Badge value={row.original.dm} /> },
  { accessorKey: "stage", header: "영입 상태", cell: ({ row }) => row.original.stage ? <Badge value={row.original.stage} /> : placeholder },
  { accessorKey: "collectedAt", header: "수집 시각", cell: ({ row }) => formatDate(row.original.collectedAt) },
];
const sortKeys: Record<string, string> = { collectedAt: "collected", name: "name", followers: "followers", score: "score", activity: "activity" };

export function DirectoryTable({ rows, total, page, pageSize, query, sort, dir }: Props) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [visible, setVisible] = useState<VisibilityState>({});
  const [all, setAll] = useState<{ total: number; ids: Picked[] }>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), state: { columnVisibility: visible }, onColumnVisibilityChange: setVisible });
  function href(path: string, additions: Record<string, string>) {
    const params = new URLSearchParams(query);
    Object.entries(additions).forEach(([key, value]) => params.set(key, value));
    return path + "?" + params.toString();
  }
  const onPage = rows.length > 0 && rows.every((row) => picked.some((item) => item.id === row.id));
  const instagram = picked.filter((item) => item.platform === "INSTAGRAM");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function toggle(row: Picked, checked: boolean) {
    if (checked && picked.length >= 100) {
      setNotice("한 번에 최대 100개 계정을 선택할 수 있습니다.");
      return;
    }
    setNotice("");
    setPicked((previous) => checked ? [...previous, row] : previous.filter((item) => item.id !== row.id));
  }
  async function prepareAll() {
    setBusy(true); setNotice(""); setAll(undefined);
    try {
      const result = await requestData<{ total: number; ids: Picked[] }>(href("/api/creators", { mode: "selection" }));
      if (result.total > 100) setNotice("필터 결과 " + result.total + "개 중 한 번에 최대 100개를 선택할 수 있습니다. 필터를 좁혀 주세요.");
      else setAll(result);
    } catch (error) { setNotice(error instanceof Error ? error.message : "선택할 수 없습니다."); }
    finally { setBusy(false); }
  }
  return <div>
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
      <strong className="mr-auto tabular-nums">계정 {total.toLocaleString("ko-KR")}개</strong>
      <Button onClick={prepareAll} disabled={!total || busy}>필터 결과 전체 선택</Button>
      <Button onClick={() => { setPicked([]); setAll(undefined); setNotice(""); }} disabled={!picked.length}>선택 해제</Button>
      <details className="relative"><summary className={buttonVariants()}><Columns3 size={15} />컬럼</summary><div className="absolute right-0 z-10 mt-2 grid w-44 gap-2 rounded-lg border border-border bg-card p-3 shadow-xl">{table.getAllLeafColumns().map((column) => <label key={column.id} className="flex gap-2 text-xs"><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{String(column.columnDef.header)}</label>)}</div></details>
      <a className={buttonVariants()} href={href("/api/creators", { mode: "export" })}><Download size={15} />CSV</a>
    </div>
    {all && <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[#232035] p-3" role="status"><span>현재 필터 조건에 해당하는 계정 {all.total}개를 선택합니다.</span><Button variant="primary" onClick={() => { setPicked(all.ids); setAll(undefined); }}>선택 확인</Button><Button onClick={() => setAll(undefined)}>취소</Button></div>}
    {notice && <p role="alert" className="p-3 text-danger">{notice}</p>}
    {picked.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[#232035] px-4 py-3"><span>선택 {picked.length}개 · Instagram {instagram.length}개</span>{instagram.length > 0 && <Link className={buttonVariants({ variant: "primary" })} href={"/compose?ids=" + instagram.map((item) => item.id).join(",")}><Send size={15} />선택 대상 DM 작성</Link>}</div>}
    {!rows.length ? <Empty title="표시할 크리에이터가 없습니다." description="검색 조건을 조정하거나 공개 프로필을 등록하세요." /> :
      <div className="overflow-auto"><table className="w-full min-w-max text-sm">
        <thead className="bg-[#13151f] text-xs text-muted-foreground">{table.getHeaderGroups().map((group) => <tr key={group.id}>
          <th className="px-4 py-3"><input type="checkbox" aria-label="현재 페이지 전체 선택" checked={onPage} onChange={(event) => {
            const ids = new Set(rows.map((row) => row.id));
            const otherPages = picked.filter((item) => !ids.has(item.id));
            if (event.target.checked && otherPages.length + rows.length > 100) {
              setNotice("한 번에 최대 100개 계정을 선택할 수 있습니다.");
              return;
            }
            setNotice("");
            setPicked(event.target.checked ? [...otherPages, ...rows.map(({ id, platform }) => ({ id, platform }))] : otherPages);
          }} /></th>
          {group.headers.map((header) => <th key={header.id} className="px-3 py-3">{sortKeys[header.id] ?
            <Link href={href("/creators", { page: "1", sort: sortKeys[header.id], dir: sort === sortKeys[header.id] && dir === "desc" ? "asc" : "desc" })}>{String(header.column.columnDef.header)} {sort === sortKeys[header.id] ? dir === "asc" ? "↑" : "↓" : "↕"}</Link> :
            flexRender(header.column.columnDef.header, header.getContext())}</th>)}
        </tr>)}</thead>
        <tbody>{table.getRowModel().rows.map((row) => <tr className="border-t border-border hover:bg-[#1e202b]" key={row.original.id}>
          <td className="px-4 py-2"><input aria-label={row.original.name + " 선택"} type="checkbox" checked={picked.some((item) => item.id === row.original.id)} onChange={(event) => toggle({ id: row.original.id, platform: row.original.platform }, event.target.checked)} /></td>
          {row.getVisibleCells().map((cell) => <td key={cell.id} className="max-w-56 truncate px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
        </tr>)}</tbody>
      </table></div>}
    <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      {page > 1 && <Link aria-label="이전 페이지" className={buttonVariants()} href={href("/creators", { page: String(page - 1) })}><ChevronLeft size={16} /></Link>}
      <span>{page} / {pages} 페이지</span>
      {page < pages && <Link aria-label="다음 페이지" className={buttonVariants()} href={href("/creators", { page: String(page + 1) })}><ChevronRight size={16} /></Link>}
    </div>
  </div>;
}
