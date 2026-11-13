"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { label } from "@/lib/labels";
import { Action, Hidden } from "./ui/form";
import { Button } from "./ui/button";
import { Badge, Empty } from "./ui/panel";
import { requestData } from "./query-provider";

type Job = { id: string; type: string; status: string; progress: number; attempts: number; createdAt: string; result: unknown; error: string | null };
function JobResult({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const result = value as { status?: string; count?: number; reason?: string; providers?: { platform: string; status: string; count: number; reason?: string }[] };
  if (result.providers) return <ul className="mt-2 grid gap-1">{result.providers.map((item) => <li key={item.platform}>{label(item.platform)} · {label(item.status)} · 저장 {item.count}건 {item.reason ? "· " + item.reason : ""}</li>)}</ul>;
  return <p className="mt-1">{result.status ? label(result.status) : ""} {result.count !== undefined ? " · 저장 " + result.count + "건" : ""} {result.reason}</p>;
}
export function JobsTable() {
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => requestData<Job[]>("/api/jobs"), refetchInterval: 5000 });
  if (jobs.isPending) return <Empty title="작업을 불러오는 중입니다." />;
  if (jobs.isError) return <Empty title="작업을 조회할 수 없습니다." description={jobs.error.message} action={<Button onClick={() => jobs.refetch()}>다시 조회</Button>} />;
  if (!jobs.data.length) return <Empty title="실행한 수집·분석 작업이 없습니다." />;
  return <div className="overflow-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-[#13151f] text-xs text-muted-foreground"><tr>{["작업", "상태", "진행률", "결과", "요청 시각", "관리"].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead>
    <tbody>{jobs.data.map((job) => <tr key={job.id} className="border-t border-border align-top">
      <td className="px-4 py-3"><strong>{label(job.type)}</strong><p className="mt-1 text-xs text-muted-foreground">{job.id.slice(0, 8)} · 시도 {job.attempts}회</p></td>
      <td className="px-4 py-3"><Badge value={job.status} /></td><td className="px-4 py-3"><progress className="h-2 w-18 accent-primary" max={100} value={job.progress} aria-label="작업 진행률" /><p className="text-xs">{job.progress}%</p></td>
      <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">{job.error && <p className="text-danger">{job.error}</p>}<JobResult value={job.result} /></td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(job.createdAt)}</td>
      <td className="px-4 py-3">{job.status === "PENDING" && !["DM_SEND", "RETENTION"].includes(job.type) && <Action action="cancelJob" next="/jobs"><Hidden value={job.id} /><Button>취소</Button></Action>}</td>
    </tr>)}</tbody>
  </table></div>;
}
