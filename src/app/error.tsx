"use client";

import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/panel";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-[60vh] place-items-center"><Empty title="페이지를 불러올 수 없습니다." description="연결을 확인하고 다시 시도하세요." action={<Button onClick={reset}>다시 시도</Button>} /></main>;
}
