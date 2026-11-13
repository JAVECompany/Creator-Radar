import { adminPage } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { QueryProvider } from "@/components/query-provider";

export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await adminPage();
  return <QueryProvider><div className="min-h-dvh lg:flex"><Sidebar email={user.email} /><main className="mx-auto min-w-0 max-w-[1680px] flex-1 px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</main></div></QueryProvider>;
}
