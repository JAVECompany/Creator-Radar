import { z } from "zod";
import { profileIdentity } from "@/lib/urls";
import { Provider, ProviderFailure, configured, count, officialJson, unsupported, type Profile } from "./types";

const user = z.object({
  data: z.object({ user: z.object({ open_id: z.string(), display_name: z.string(), avatar_url: z.string().optional(),
    username: z.string().optional(), bio_description: z.string().optional(), follower_count: z.number().optional() }) }),
});
const videos = z.object({ data: z.object({ videos: z.array(z.object({
  id: z.string(), title: z.string().optional(), create_time: z.number().optional(), share_url: z.string(),
})).default([]) }) });
function scopes() { return new Set((process.env.TIKTOK_SCOPES ?? "").split(/[ ,]+/)); }
async function api(path: string, fields: string, post = false) {
  const url = new URL("https://open.tiktokapis.com/v2/" + path + "/");
  url.searchParams.set("fields", fields);
  const json = await officialJson(url, { method: post ? "POST" : "GET",
    headers: { Authorization: "Bearer " + process.env.TIKTOK_ACCESS_TOKEN, "Content-Type": "application/json" },
    body: post ? JSON.stringify({ max_count: 15 }) : undefined,
  });
  const envelope = z.object({ error: z.object({ code: z.string() }).optional() }).parse(json);
  if (envelope.error && envelope.error.code !== "ok") throw new ProviderFailure(
    envelope.error.code === "rate_limit_exceeded" ? "RATE_LIMITED" : /token|scope/.test(envelope.error.code) ? "AUTH_REQUIRED" : "FAILED",
    "TikTok 토큰과 승인 범위를 확인하세요.",
  );
  return json;
}

export class TikTokProvider extends Provider {
  getProviderCapabilities() {
    const configured = Boolean(process.env.TIKTOK_ACCESS_TOKEN && scopes().has("user.info.basic") && scopes().has("user.info.profile"));
    return { platform: "TIKTOK", search: "none", profile: true, contents: scopes().has("video.list"), metrics: scopes().has("user.info.stats"),
      configured, approval: !configured, description: "Display API로 직접 동의한 계정만 조회 · 일반 계정 검색은 수동 등록" } as const;
  }
  getCreatorProfile(profileUrl: string) {
    return configured<Profile>(this.getProviderCapabilities().configured, async () => {
      const identity = profileIdentity("TIKTOK", profileUrl);
      const granted = scopes();
      const fields = "open_id,display_name,avatar_url,username,bio_description" + (granted.has("user.info.stats") ? ",follower_count" : "");
      const { data: { user: info } } = user.parse(await api("user/info", fields));
      if (!info.username || identity.handle !== "@" + info.username.toLowerCase()) return unsupported("이 계정의 명시적 TikTok 동의가 확인되지 않았습니다.");
      const profile: Profile = { ...identity, platform: "TIKTOK", externalId: info.open_id, name: info.display_name, avatarUrl: info.avatar_url, bio: info.bio_description, followers: count(info.follower_count) };
      if (!granted.has("video.list")) return { status: "PARTIAL", data: profile };
      try {
        const { data } = videos.parse(await api("video/list", "id,title,create_time,share_url", true));
        profile.contents = data.videos.map((item) => ({ url: item.share_url, externalId: item.id, title: item.title, publishedAt: item.create_time ? new Date(item.create_time * 1000) : undefined }));
        return { status: "SUCCESS", data: profile };
      } catch { return { status: "PARTIAL", data: profile, reason: "TikTok 공개 영상 권한 또는 응답을 확인하세요." }; }
    });
  }
}
