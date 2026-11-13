import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { label } from "@/lib/labels";

export function Panel({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
    {(title || action) && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}</div>{action}</div>}
    {children}
  </section>;
}
export function PageTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[28px] font-bold tracking-tight">{title}</h1>{description && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</header>;
}
export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="grid min-h-39 place-items-center gap-2 px-4 py-8 text-center"><span className="grid size-9 place-items-center rounded-lg bg-[#252437] text-primary"><Inbox size={17} /></span><div><p className="font-semibold">{title}</p>{description && <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>}</div>{action}</div>;
}
export function Badge({ value, tone }: { value: string; tone?: "green" | "amber" | "red" | "violet" }) {
  const style = tone ?? (["SENT", "MANUALLY_SENT", "COMPLETED", "VERIFIED", "CLEARED", "APPROVED", "SUCCESS"].includes(value) ? "green" :
    ["FAILED", "HOLD", "EXCLUDED", "REJECTED"].includes(value) ? "red" :
    ["QUEUED", "RUNNING", "REVIEW", "NOT_ELIGIBLE"].includes(value) ? "amber" : "violet");
  return <span className={cn("inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap", {
    green: "bg-[#1b382f] text-[#8fdec0]", amber: "bg-[#3b3124] text-[#f2c485]", red: "bg-[#40252e] text-[#ff9ba4]", violet: "bg-[#2b2843] text-[#c5bcff]",
  }[style])}>{label(value)}</span>;
}
export function Flash({ query }: { query: Record<string, string | string[] | undefined> }) {
  const error = typeof query.error === "string" ? query.error : undefined;
  const notice = typeof query.notice === "string" ? query.notice : undefined;
  if (!error && !notice) return null;
  return <div role={error ? "alert" : "status"} className={cn("mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm", error ? "border-[#623b49] bg-[#301d27] text-danger" : "border-[#2c5448] bg-[#1b302b] text-[#a9e1cf]")}><CircleAlert size={16} />{(error ?? notice)?.slice(0, 250)}</div>;
}
export function LinkOut({ url, children }: { url: string; children: ReactNode }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>;
}
