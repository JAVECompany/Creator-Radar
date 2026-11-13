"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Binoculars, ChevronDown, ContactRound, LayoutDashboard, Link2, ListChecks, LogOut, Radar, Send, Settings, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "대시보드", href: "/", icon: LayoutDashboard }, { label: "크리에이터 탐색", href: "/discover", icon: Binoculars },
  { label: "전체 크리에이터", href: "/creators", icon: UsersRound }, { label: "영입 후보 관리", href: "/candidates", icon: ContactRound },
  { label: "DM 작성 및 템플릿", href: "/compose", icon: Send }, { label: "DM 전송 관리", href: "/messages", icon: ListChecks },
  { label: "SNS 연결", href: "/connections", icon: Link2 }, { label: "수집 및 분석 작업", href: "/jobs", icon: Activity },
  { label: "설정", href: "/settings", icon: Settings },
];
export function Brand() {
  return <Link href="/" className="inline-flex items-center gap-2.5 font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-[10px] bg-[#a499ff] text-[#191333]"><Radar size={22} strokeWidth={2.2} /></span><span className="text-[17px]">Creator Radar</span></Link>;
}
export function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const nav = <nav aria-label="관리자 메뉴" className="grid gap-1">{items.map(({ href, label, icon: Icon }) => {
    const active = href === "/" ? path === href : path === href || path.startsWith(href + "/");
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
      active ? "bg-[#2c2748] font-semibold text-[#c8beff]" : "text-[#a8aabd] hover:bg-[#22242f] hover:text-foreground")}><Icon size={17} strokeWidth={1.8} />{label}</Link>;
  })}</nav>;
  return <>
    <aside className="sticky top-0 hidden h-dvh w-57 shrink-0 flex-col border-r border-border bg-[#151620] px-3.5 py-5 lg:flex">
      <div className="px-2 pb-7"><Brand /></div>{nav}
      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2 pt-4"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#292640] text-xs font-bold text-primary">{email[0]?.toUpperCase()}</span><span title={email} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{email}</span>
        <form method="post" action="/api/auth/logout"><button aria-label="로그아웃" className="rounded p-1 text-muted-foreground hover:text-foreground"><LogOut size={16} /></button></form>
      </div>
    </aside>
    <header className="border-b border-border bg-[#151620] px-4 py-3 lg:hidden">
      <details><summary className="flex items-center justify-between"><Brand /><ChevronDown size={20} /></summary><div className="pt-4">{nav}<form method="post" action="/api/auth/logout"><button className="mt-2 px-3 py-2 text-muted-foreground">로그아웃</button></form></div></details>
    </header>
  </>;
}
