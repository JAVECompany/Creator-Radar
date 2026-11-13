import { z } from "zod";
import { appUrl } from "./config";
import { check } from "./errors";

export const params = (request: Request) => new URL(request.url).searchParams;
export const ok = (data: unknown) => Response.json({ ok: true, data });
export async function readText(request: Request, max = 65536) {
  check(request.body, "요청 본문이 필요합니다.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      check(size <= max, "요청 본문이 너무 큽니다.", 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => undefined); }
}
export async function json(request: Request) {
  check(request.headers.get("content-type")?.split(";")[0] === "application/json", "JSON 요청만 지원합니다.", 415);
  const body = await readText(request);
  try { return JSON.parse(body) as unknown; } catch { check(false, "JSON 형식이 잘못되었습니다."); }
}
export async function htmlForm(request: Request) {
  check(request.headers.get("content-type")?.split(";")[0] === "application/x-www-form-urlencoded", "잘못된 양식입니다.", 415);
  const form = new FormData();
  for (const [key, value] of new URLSearchParams(await readText(request))) form.append(key, value);
  return form;
}
export function back(path: unknown, message?: string, error = false) {
  const root = appUrl();
  const route = z.string().max(2048).safeParse(path);
  const target = new URL(route.success && /^\/(?![/\\])/.test(route.data) ? route.data : "/", root);
  if (target.origin !== root.origin) return Response.redirect(root, 303);
  target.searchParams.delete("error"); target.searchParams.delete("notice");
  if (message) target.searchParams.set(error ? "error" : "notice", message);
  return Response.redirect(target, 303);
}
