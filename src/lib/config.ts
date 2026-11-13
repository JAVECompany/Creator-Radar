import { check } from "./errors";

export function appUrl() {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  check(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)), "APP_URL에 HTTPS가 필요합니다.", 503);
  return url;
}
export function graphVersion() {
  const version = process.env.META_GRAPH_VERSION;
  check(version && /^v\d+\.\d+$/.test(version), "Meta Graph API 버전을 설정해 주세요.", 503);
  return version;
}
export function assertOrigin(request: Request) {
  check(request.headers.get("origin") === appUrl().origin, "요청 출처가 일치하지 않습니다.", 403);
}
