import Link from "next/link";
import { Empty } from "@/components/ui/panel";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return <main className="grid min-h-[60vh] place-items-center"><Empty title="페이지를 찾을 수 없습니다." action={<Link href="/" className={buttonVariants()}>대시보드로 이동</Link>} /></main>;
}
