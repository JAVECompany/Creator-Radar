import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Creator Radar", template: "%s | Creator Radar" }, description: "크리에이터 발굴 및 영입 관리", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
