import { z } from "zod";
import { profileIdentity, publicUrl } from "@/lib/urls";
import { Provider, configured, officialJson, unsupported, validDate, type SearchInput, type Profile } from "./types";

const posts = z.object({ items: z.array(z.object({
  title: z.string(), link: z.string(), bloggername: z.string(), bloggerlink: z.string(), postdate: z.string().optional(),
})) });
export class NaverBlogProvider extends Provider {
  getProviderCapabilities() {
    return { platform: "NAVER_BLOG", search: "keyword", profile: false, contents: true, metrics: false,
      configured: Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET), approval: process.env.NAVER_PERSISTENCE_APPROVED !== "true",
      description: "NAVER API HUB 블로그 글 검색 · 확인 가능한 작성자와 글 메타데이터 · 팔로워/독립 프로필 조회 미지원" } as const;
  }
  searchCreators({ query }: SearchInput) {
    if (this.getProviderCapabilities().approval) return Promise.resolve(unsupported<Profile[]>("NAVER 검색 결과를 CRM에 보관할 권한이 확인되어야 합니다."));
    return configured<Profile[]>(this.getProviderCapabilities().configured, async () => {
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/blog");
      url.search = new URLSearchParams({ query, display: "25", format: "json" }).toString();
      const { items } = posts.parse(await officialJson(url, { headers: {
        "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_CLIENT_ID ?? "",
        "X-NCP-APIGW-API-KEY": process.env.NAVER_CLIENT_SECRET ?? "",
      } }));
      const profiles = new Map<string, Profile>();
      for (const item of items) {
        const raw = item.bloggerlink.replace(/^http:/i, "https:");
        let identity: ReturnType<typeof profileIdentity>;
        try { identity = profileIdentity("NAVER_BLOG", raw); } catch { continue; }
        const profile = profiles.get(identity.profileUrl) ?? { ...identity, platform: "NAVER_BLOG", name: item.bloggername || identity.handle, contents: [] };
        const post = publicUrl(item.link.replace(/^http:/i, "https:"));
        const day = item.postdate?.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
        if (post && ["blog.naver.com", "m.blog.naver.com"].includes(post.hostname) && post.pathname.split("/")[1]?.toLowerCase() === identity.handle) {
          profile.contents?.push({ url: post.href, title: item.title.replace(/<\/?b>/gi, ""), publishedAt: validDate(day) });
        }
        profiles.set(identity.profileUrl, profile);
      }
      return { status: "PARTIAL", data: [...profiles.values()], reason: "검색 결과에서 네이버 블로그 작성자만 가져왔습니다." };
    });
  }
}
