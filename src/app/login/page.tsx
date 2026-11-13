import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Flash } from "@/components/ui/panel";
import { Brand } from "@/components/sidebar";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 로그인" };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.SESSION_SECRET && await auth()) redirect("/");
  return <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,#27223d_0%,#101117_55%)] px-5 py-10">
    <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-black/30">
      <Brand /><h1 className="mt-8 text-2xl font-bold">관리자 로그인</h1><p className="mb-6 mt-2 text-sm text-muted-foreground">관리자 계정으로 접속하세요.</p>
      <Flash query={await searchParams} />
      <form method="post" action="/api/auth/login" className="grid gap-4">
        <Field label="이메일"><Input type="email" name="email" autoComplete="username" required /></Field>
        <Field label="비밀번호"><Input type="password" name="password" autoComplete="current-password" required /></Field>
        <Button variant="primary" type="submit" className="mt-2">로그인</Button>
      </form>
    </div>
  </main>;
}
