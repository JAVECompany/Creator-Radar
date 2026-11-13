"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "./ui/button";
import { Field, Select, Textarea } from "./ui/form";
import { Badge } from "./ui/panel";
import { requestData } from "./query-provider";

type Target = { id: string; name: string; handle: string };
type Input = { accountIds: string[]; connectionId?: string; templateId?: string; body: string; requestId: string; followUpToId?: string; send: boolean };
type Preview = { approval: { expiresAt: number; hash: string }; total: number; api: number; unavailable: number; blocked: number; sent: number; duplicate: number;
  rows: (Target & { body: string; api: boolean; blocked: boolean; reason: string | null })[] };
function submit<T>(mode: "preview" | "confirm", input: Input, approval?: Preview["approval"]) {
  return requestData<T>("/api/dm/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, input, approval, confirmed: mode === "confirm" ? true : undefined }) });
}

export function Composer({ targets, templates, connections, followUp, initialBody }: {
  targets: Target[]; templates: { id: string; name: string; body: string }[];
  connections: { id: string; username: string; usable: boolean }[]; followUp?: string; initialBody?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody ?? "");
  const [template, setTemplate] = useState("");
  const [connection, setConnection] = useState("");
  const [review, setReview] = useState<{ input: Input; preview: Preview }>();
  const [checked, setChecked] = useState(false);
  const mutation = useMutation({ mutationFn: async (input: Input) => ({ input, preview: await submit<Preview>("preview", input) }), onSuccess: setReview });
  const confirm = useMutation({ mutationFn: ({ input, approval }: { input: Input; approval: Preview["approval"] }) => submit<{ count: number }>("confirm", input, approval),
    onSuccess: (result) => router.push("/messages?notice=" + encodeURIComponent(result.count + "개 DM 작업을 저장했습니다.")) });
  const pending = mutation.isPending || confirm.isPending;
  function reset() { setReview(undefined); setChecked(false); mutation.reset(); confirm.reset(); }
  function preview() {
    reset();
    mutation.mutate({ accountIds: targets.map((target) => target.id), body, templateId: template || undefined,
      connectionId: connection || undefined, requestId: crypto.randomUUID(), followUpToId: followUp, send: true });
  }
  return <div className="grid gap-4 p-5">
    <div className="flex flex-wrap gap-2">{targets.map((target) => <Badge key={target.id} value={target.name + " · @" + target.handle} />)}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="템플릿"><Select value={template} disabled={pending} onChange={(event) => {
        const selected = templates.find((item) => item.id === event.target.value);
        setTemplate(event.target.value); if (selected) setBody(selected.body); reset();
      }}><option value="">직접 작성</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="발신 계정"><Select value={connection} disabled={pending} onChange={(event) => { setConnection(event.target.value); reset(); }}>
        <option value="">수동 발송</option>{connections.map((item) => <option key={item.id} value={item.id} disabled={!item.usable}>@{item.username}{item.usable ? "" : " · 권한 확인 필요"}</option>)}
      </Select></Field>
    </div>
    <Field label="메시지"><Textarea rows={6} maxLength={1000} value={body} disabled={pending} onChange={(event) => { setBody(event.target.value); reset(); }} placeholder="안녕하세요, {{name}}님." /></Field>
    <p className="text-xs text-muted-foreground">개인화 변수 <code>{"{{name}}"}</code>과 <code>{"{{handle}}"}</code>을 사용할 수 있습니다. 공백을 포함해 최대 UTF-8 1,000바이트입니다.</p>
    <div><Button variant="primary" disabled={pending || !body.trim()} onClick={preview}>수신자별 미리보기</Button></div>
    {(mutation.error || confirm.error) && <p role="alert" className="text-danger">{(mutation.error ?? confirm.error)?.message}</p>}
    {review && <div className="grid gap-3 rounded-lg border border-border bg-[#13151e] p-4">
      <div className="flex flex-wrap gap-2"><Badge value={"선택 " + review.preview.total} /><Badge value={"API 가능 " + review.preview.api} tone="green" />
        <Badge value={"API 불가 · 수동 " + review.preview.unavailable} tone="amber" /><Badge value={"이미 전송 " + review.preview.sent} />
        <Badge value={"중복 " + review.preview.duplicate} /><Badge value={"차단 " + review.preview.blocked} tone="red" /></div>
      <ul className="grid max-h-96 gap-2 overflow-auto">{review.preview.rows.map((row) => <li className="rounded-lg border border-border p-3" key={row.id}>
        <div className="flex flex-wrap gap-2"><strong>{row.name} · @{row.handle}</strong><Badge value={row.blocked ? "차단" : row.api ? "API 가능" : "수동 발송"} /></div>
        <p className="mt-1 whitespace-pre-wrap">{row.body}</p>{row.reason && <p className="mt-2 text-xs text-muted-foreground">{row.reason}</p>}
      </li>)}</ul>
      <label className="flex gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />대상과 내용을 확인했습니다.</label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!checked || pending || review.preview.total === review.preview.blocked} onClick={() => confirm.mutate({ input: { ...review.input, send: false }, approval: review.preview.approval })}>초안 저장</Button>
        <Button variant="primary" disabled={!checked || pending || review.preview.total === review.preview.blocked} onClick={() => confirm.mutate({ input: review.input, approval: review.preview.approval })}><Send size={15} />{review.preview.api > 0 ? "전송 확인 및 작업 생성" : "수동 발송 작업 생성"}</Button>
      </div>
    </div>}
  </div>;
}

export function CopyMessage({ body }: { body: string }) {
  const [notice, setNotice] = useState("");
  return <div className="flex items-center gap-2"><Button onClick={async () => {
    try { await navigator.clipboard.writeText(body); setNotice("복사했습니다."); } catch { setNotice("메시지 본문을 직접 선택해 복사하세요."); }
  }}>메시지 복사</Button>{notice && <span role="status" className="text-xs text-muted-foreground">{notice}</span>}</div>;
}
