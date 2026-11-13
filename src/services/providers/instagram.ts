import { z } from "zod";
import { graphVersion } from "@/lib/config";
import { profileIdentity } from "@/lib/urls";
import { Provider, configured, count, officialJson, unsupported, validDate, type SearchInput, type Profile } from "./types";

const discovery = z.object({ business_discovery: z.object({
  id: z.string(), username: z.string(), name: z.string().nullish(), biography: z.string().nullish(), website: z.string().nullish(),
  profile_picture_url: z.string().nullish(), followers_count: z.number().optional(),
  media: z.object({ data: z.array(z.object({ id: z.string(), permalink: z.string().optional(), timestamp: z.string().optional() })) }).optional(),
}) });
export class InstagramProvider extends Provider {
  getProviderCapabilities() {
    const configured = Boolean(process.env.IG_DISCOVERY_TOKEN && /^\d+$/.test(process.env.IG_DISCOVERY_ACCOUNT_ID ?? "") && process.env.META_GRAPH_VERSION);
    return { platform: "INSTAGRAM", search: "username", profile: true, contents: true, metrics: true,
      configured, approval: !configured, description: "Facebook Login Business Discovery · 정확한 프로페셔널 사용자명 · 일반 계정/키워드 검색 미지원" } as const;
  }
  verifyDiscovery() {
    return configured<string>(this.getProviderCapabilities().configured, async () => {
      const url = new URL("https://graph.facebook.com/" + graphVersion() + "/" + process.env.IG_DISCOVERY_ACCOUNT_ID);
      url.searchParams.set("fields", "id,username");
      const { id, username } = z.object({ id: z.string(), username: z.string().min(1) })
        .parse(await officialJson(url, { headers: { Authorization: "Bearer " + process.env.IG_DISCOVERY_TOKEN } }));
      if (id !== process.env.IG_DISCOVERY_ACCOUNT_ID) return { status: "FAILED", reason: "Instagram 계정 ID가 일치하지 않습니다." };
      return { status: "SUCCESS", data: username };
    });
  }
  async searchCreators({ query }: SearchInput) {
    if (!/^@?[\w.]{1,30}$/.test(query)) return unsupported<Profile[]>("Instagram은 프로페셔널 계정의 정확한 사용자명만 조회합니다.");
    const result = await this.getCreatorProfile("https://www.instagram.com/" + query.replace(/^@/, ""));
    return { ...result, data: result.data ? [result.data] : undefined };
  }
  getCreatorProfile(profileUrl: string) {
    return configured<Profile>(this.getProviderCapabilities().configured, async () => {
      const { handle } = profileIdentity("INSTAGRAM", profileUrl);
      const url = new URL("https://graph.facebook.com/" + graphVersion() + "/" + process.env.IG_DISCOVERY_ACCOUNT_ID);
      url.searchParams.set("fields", "business_discovery.username(" + handle + "){id,username,name,biography,website,profile_picture_url,followers_count,media.limit(12){id,permalink,timestamp}}");
      const { business_discovery: data } = discovery.parse(await officialJson(url, { headers: { Authorization: "Bearer " + process.env.IG_DISCOVERY_TOKEN } }));
      const identity = profileIdentity("INSTAGRAM", "https://www.instagram.com/" + data.username);
      return { status: "SUCCESS", data: { ...identity, platform: "INSTAGRAM", externalId: data.id,
        name: data.name || data.username, bio: data.biography ?? undefined, avatarUrl: data.profile_picture_url ?? undefined,
        links: data.website ? [data.website] : [], followers: count(data.followers_count),
        contents: data.media?.data.flatMap((item) => item.permalink ? [{ externalId: item.id, url: item.permalink, publishedAt: validDate(item.timestamp) }] : []),
      } };
    });
  }
}
