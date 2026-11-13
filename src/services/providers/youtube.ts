import { z } from "zod";
import { profileIdentity } from "@/lib/urls";
import { Provider, configured, count, officialJson, validDate, type SearchInput, type Profile, type Content } from "./types";

const channel = z.object({
  id: z.string().regex(/^UC[\w-]{22}$/),
  snippet: z.object({ title: z.string(), customUrl: z.string().optional(), description: z.string().optional(), country: z.string().optional(), thumbnails: z.object({ default: z.object({ url: z.string() }).optional() }).optional() }),
  statistics: z.object({ subscriberCount: z.string().optional(), hiddenSubscriberCount: z.boolean().optional() }).optional(),
  contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().optional() }) }).optional(),
});
const results = z.object({ items: z.array(z.object({ id: z.object({ channelId: z.string() }) })).default([]) });
const uploads = z.object({ items: z.array(z.object({
  contentDetails: z.object({ videoId: z.string().regex(/^[\w-]{11}$/), videoPublishedAt: z.string().optional() }),
  snippet: z.object({ title: z.string() }).optional(),
})).default([]) });

function api(path: string, query: Record<string, string>) {
  const url = new URL("https://www.googleapis.com/youtube/v3/" + path);
  url.search = new URLSearchParams({ ...query, key: process.env.YOUTUBE_API_KEY ?? "" }).toString();
  return officialJson(url);
}
function mapChannel(item: z.infer<typeof channel>): Profile {
  return { platform: "YOUTUBE", externalId: item.id, handle: item.snippet.customUrl ?? item.id,
    name: item.snippet.title, profileUrl: "https://www.youtube.com/channel/" + item.id,
    country: item.snippet.country, avatarUrl: item.snippet.thumbnails?.default?.url,
    bio: item.snippet.description, followers: item.statistics?.hiddenSubscriberCount ? undefined : count(item.statistics?.subscriberCount) };
}
export class YouTubeProvider extends Provider {
  getProviderCapabilities() {
    return { platform: "YOUTUBE", search: "keyword", profile: true, contents: true, metrics: true,
      configured: Boolean(process.env.YOUTUBE_API_KEY), approval: false,
      description: "채널 키워드 검색 · 공개 채널/구독자/영상 메타데이터 · YouTube 데이터의 파생 분석 미지원" } as const;
  }
  searchCreators({ query, country }: SearchInput) {
    return configured<Profile[]>(this.getProviderCapabilities().configured, async () => {
      const search = results.parse(await api("search", { part: "snippet", type: "channel", safeSearch: "strict", maxResults: "25", q: query, ...(country ? { regionCode: country } : {}) }));
      const ids = [...new Set(search.items.map((item) => item.id.channelId))];
      if (!ids.length) return { status: "SUCCESS", data: [] };
      const channels = z.object({ items: z.array(channel) }).parse(await api("channels", { part: "snippet,statistics", id: ids.join(",") }));
      return { status: channels.items.length === ids.length ? "SUCCESS" : "PARTIAL", data: channels.items.map(mapChannel) };
    });
  }
  getCreatorProfile(profileUrl: string) {
    return configured<Profile>(this.getProviderCapabilities().configured, async () => {
      const identity = profileIdentity("YOUTUBE", profileUrl);
      const { items } = z.object({ items: z.array(channel) }).parse(await api("channels", {
        part: "snippet,statistics,contentDetails", ...(identity.externalId ? { id: identity.externalId } : { forHandle: identity.handle }),
      }));
      if (!items.length) return { status: "FAILED", reason: "공개 채널이 확인되지 않았습니다." };
      const profile = mapChannel(items[0]);
      const playlistId = items[0].contentDetails?.relatedPlaylists.uploads;
      if (!playlistId) return { status: "PARTIAL", data: profile };
      try {
        const contents = uploads.parse(await api("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: "20" }));
        const ids = contents.items.map((item) => item.contentDetails.videoId);
        const visible = ids.length ? z.object({ items: z.array(z.object({ id: z.string(), status: z.object({
          privacyStatus: z.string(), uploadStatus: z.string().optional(),
        }) })) }).parse(await api("videos", { part: "status", id: ids.join(",") })).items : [];
        const publicIds = new Set(visible.filter((item) => item.status.privacyStatus === "public" && item.status.uploadStatus === "processed").map((item) => item.id));
        profile.contents = contents.items.filter((item) => publicIds.has(item.contentDetails.videoId))
          .map<Content>(({ contentDetails: { videoId, videoPublishedAt }, snippet }) => ({
            externalId: videoId, url: "https://www.youtube.com/watch?v=" + videoId, title: snippet?.title, publishedAt: validDate(videoPublishedAt),
          }));
        return { status: "SUCCESS", data: profile };
      } catch { return { status: "PARTIAL", data: profile, reason: "공개 영상 목록을 가져오지 못했습니다." }; }
    });
  }
}
