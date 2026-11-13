import { z } from "zod";
import { profileIdentity } from "@/lib/urls";
import { Provider, ProviderFailure, configured, count, officialJson, type Profile, type SearchInput } from "./types";

const ownSchema = z.object({ id: z.string().min(1), username: z.string().min(1), name: z.string().nullish(),
  threads_biography: z.string().nullish(), threads_profile_picture_url: z.string().nullish() });
const publicSchema = z.object({ username: z.string().optional(), name: z.string().nullish(), biography: z.string().nullish(),
  profile_picture_url: z.string().nullish(), follower_count: z.union([z.number().int().nonnegative(), z.string()]).optional() })
  .refine((profile) => Boolean(profile.username || profile.name || profile.profile_picture_url || profile.biography));
export const threadsConfigured = () => Boolean(process.env.THREADS_ACCESS_TOKEN);
function threadsApi(path: string, fields: Record<string, string>) {
  const url = new URL("https://graph.threads.com/" + path);
  url.search = new URLSearchParams({ ...fields, access_token: process.env.THREADS_ACCESS_TOKEN ?? "" }).toString();
  return officialJson(url);
}
export async function readThreadsAccount(): Promise<Profile> {
  if (!threadsConfigured()) throw new ProviderFailure("AUTH_REQUIRED", "Threads 사용자 토큰을 설정하세요.");
  const own = ownSchema.parse(await threadsApi("me", { fields: "id,username,name,threads_biography,threads_profile_picture_url" }));
  const identity = profileIdentity("THREADS", "https://www.threads.com/@" + own.username);
  return { ...identity, platform: "THREADS", name: own.name || own.username, avatarUrl: own.threads_profile_picture_url ?? undefined, bio: own.threads_biography ?? undefined };
}

export class ThreadsProvider extends Provider {
  getProviderCapabilities() {
    return { platform: "THREADS", search: "username", configured: threadsConfigured(), approval: false,
      profile: true, contents: false, metrics: true, description: "정확한 Threads 사용자명 · 공개 프로필 조회에는 threads_profile_discovery 권한 필요" } as const;
  }
  async searchCreators({ query }: SearchInput) {
    const username = query.replace(/^@/, "");
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) return { status: "NOT_SUPPORTED", reason: "Threads의 정확한 사용자명을 입력하세요." } as const;
    const result = await this.getCreatorProfile("https://www.threads.com/@" + username);
    return { ...result, data: result.data ? [result.data] : undefined };
  }
  getCreatorProfile(profileUrl: string) {
    return configured<Profile>(threadsConfigured(), async () => {
      const identity = profileIdentity("THREADS", profileUrl);
      const own = await readThreadsAccount();
      if (own.handle === identity.handle) return { status: "SUCCESS", data: own };
      const profile = publicSchema.parse(await threadsApi("profile_lookup", { username: identity.handle.slice(1) }));
      if (profile.username && ("@" + profile.username.toLowerCase()) !== identity.handle)
        throw new ProviderFailure("FAILED", "Threads 응답의 사용자명이 요청과 일치하지 않습니다.");
      return { status: "SUCCESS", data: { ...identity, platform: "THREADS", name: profile.name || identity.handle,
        bio: profile.biography ?? undefined, avatarUrl: profile.profile_picture_url ?? undefined, followers: count(profile.follower_count) } };
    });
  }
}
