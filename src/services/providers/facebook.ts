import { z } from "zod";
import { graphVersion } from "@/lib/config";
import { profileIdentity } from "@/lib/urls";
import { Provider, ProviderFailure, configured, count, officialJson, unsupported, type Profile, type SearchInput } from "./types";

export function facebookConfigured() {
  return Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && /^\d{5,30}$/.test(process.env.FACEBOOK_PAGE_ID ?? "") && process.env.META_GRAPH_VERSION);
}
const pageSchema = z.object({
  id: z.string().regex(/^\d{5,30}$/),
  name: z.string().min(1),
  is_published: z.boolean().optional(),
  username: z.string().nullish(),
  about: z.string().nullish(),
  followers_count: z.number().int().nonnegative().optional(),
  picture: z.object({ data: z.object({ url: z.string().optional() }) }).optional(),
});

export async function readFacebookPage(): Promise<Profile> {
  if (!facebookConfigured()) throw new ProviderFailure("AUTH_REQUIRED", "Facebook 페이지 ID와 페이지 토큰을 설정하세요.");
  const url = new URL("https://graph.facebook.com/" + graphVersion() + "/me");
  url.searchParams.set("fields", "id,name,is_published,username,about,followers_count,picture");
  const page = pageSchema.parse(await officialJson(url, { headers: { Authorization: "Bearer " + process.env.FACEBOOK_PAGE_ACCESS_TOKEN } }));
  if (page.id !== process.env.FACEBOOK_PAGE_ID)
    throw new ProviderFailure("AUTH_REQUIRED", "Facebook 페이지 ID와 페이지 액세스 토큰이 일치하지 않습니다.");
  if (page.is_published !== true) throw new ProviderFailure("NOT_SUPPORTED", "공개 Facebook 페이지임을 확인할 수 없습니다.");
  const identity = profileIdentity("FACEBOOK", "https://www.facebook.com/" + page.id);
  return { ...identity, platform: "FACEBOOK", handle: page.username?.toLowerCase() || page.id, name: page.name,
    bio: page.about ?? undefined, followers: count(page.followers_count), avatarUrl: page.picture?.data.url };
}
export class FacebookProvider extends Provider {
  getProviderCapabilities() {
    return { platform: "FACEBOOK", search: "username", configured: facebookConfigured(), approval: false,
      profile: true, contents: false, metrics: true, description: "연결한 공개 Facebook 페이지만 조회 · 페이지 사용자명 또는 숫자 ID" } as const;
  }
  searchCreators({ query }: SearchInput) {
    return configured<Profile[]>(facebookConfigured(), async () => {
      const page = await readFacebookPage();
      const key = query.replace(/^@/, "").toLowerCase();
      if (key !== page.handle && key !== page.externalId) return unsupported("연결된 Facebook 페이지의 사용자명 또는 숫자 ID를 입력하세요.");
      return { status: "SUCCESS", data: [page] };
    });
  }
  getCreatorProfile(profileUrl: string) {
    return configured<Profile>(facebookConfigured(), async () => {
      const identity = profileIdentity("FACEBOOK", profileUrl);
      const page = await readFacebookPage();
      if (![page.handle, page.externalId].includes(identity.handle)) return unsupported("연결된 공개 Facebook 페이지의 URL만 갱신할 수 있습니다.");
      return { status: "SUCCESS", data: page };
    });
  }
}
