import { isIP } from "node:net";
import { check } from "./errors";
import type { SupportedPlatform } from "./platforms";

export function publicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") ||
      host.endsWith(".") || /\.(localhost|local|internal|test|invalid)$/.test(host) ||
      isIP(host) || value.length > 2048) return null;
  return url;
}
export function externalLinks(text: string) {
  return (text.match(/https:\/\/[^\s<>"')\]]+/gi) ?? []).slice(0, 25)
    .map((url) => publicUrl(url)?.href).filter((url): url is string => Boolean(url));
}
export function profileIdentity(platform: SupportedPlatform, input: string) {
  const url = publicUrl(input.trim());
  check(url, "공개 HTTPS 프로필 URL을 입력하세요.");
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let handle: string | undefined;
  let canonical: string | undefined;
  let externalId: string | undefined;

  if (platform === "INSTAGRAM" && host === "instagram.com" && parts.length === 1 &&
      /^[a-z0-9._]{1,30}$/i.test(parts[0]) && !/^(p|reel|reels|stories|explore|direct|accounts|about|developer|legal|web|api)$/i.test(parts[0])) {
    handle = parts[0].toLowerCase();
    canonical = "https://www.instagram.com/" + handle + "/";
  } else if (platform === "THREADS" && ["threads.com", "threads.net"].includes(host) && parts.length === 1 && /^@[a-z0-9._]{1,30}$/i.test(parts[0])) {
    handle = parts[0].toLowerCase();
    canonical = "https://www.threads.com/" + handle;
  } else if (platform === "FACEBOOK" && ["facebook.com", "m.facebook.com", "web.facebook.com"].includes(host) && parts.length === 1) {
    const part = parts[0].toLowerCase();
    const id = part === "profile.php" ? url.searchParams.get("id") : part;
    if (id && /^\d{5,30}$/.test(id)) {
      handle = externalId = id;
      canonical = "https://www.facebook.com/profile.php?id=" + id;
    } else if (/^[a-z0-9.]{1,80}$/.test(part) && !/^(profile\.php|share|login|watch|reel|groups|pages|events|marketplace|help|settings|me|people)$/.test(part)) {
      handle = part;
      canonical = "https://www.facebook.com/" + part;
    }
  } else if (platform === "YOUTUBE" && host === "youtube.com") {
    if (parts.length === 2 && parts[0] === "channel" && /^UC[a-z\d_-]{22}$/i.test(parts[1])) {
      handle = externalId = parts[1];
      canonical = "https://www.youtube.com/channel/" + handle;
    } else if (parts.length === 1 && /^@[\p{L}\p{N}_.%-]{1,150}$/u.test(parts[0])) {
      try {
        handle = decodeURIComponent(parts[0]).normalize("NFKC").toLowerCase();
        if (/^@[\p{L}\p{N}_.-]{1,100}$/u.test(handle)) canonical = "https://www.youtube.com/@" + encodeURIComponent(handle.slice(1));
      } catch { /* Invalid percent escape. */ }
    }
  }
  check(handle && canonical, "선택한 플랫폼의 프로필 주소 형식을 확인하세요.");
  return { handle, profileUrl: canonical, externalId };
}
