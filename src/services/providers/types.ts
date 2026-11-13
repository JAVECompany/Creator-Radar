import type { Platform } from "@prisma/client";

export type ProviderStatus = "SUCCESS" | "PARTIAL" | "NOT_SUPPORTED" | "AUTH_REQUIRED" | "RATE_LIMITED" | "UNAVAILABLE" | "FAILED";
export type Result<T> = { status: ProviderStatus; data?: T; reason?: string };
export type Capabilities = {
  platform: Platform; search: "keyword" | "username";
  profile: boolean; contents: boolean; metrics: boolean;
  configured: boolean; approval: boolean; description: string;
};
export type SearchInput = { query: string; country?: string };
export type Content = { url: string; externalId?: string; title?: string; publishedAt?: Date };
export type Profile = {
  platform: Platform; externalId?: string; handle: string; profileUrl: string; name: string;
  country?: string; avatarUrl?: string; bio?: string; links?: string[]; followers?: bigint;
  contents?: Content[];
};

export abstract class Provider {
  abstract getProviderCapabilities(): Capabilities;
  async searchCreators(input: SearchInput): Promise<Result<Profile[]>> {
    void input;
    return unsupported();
  }
  async getCreatorProfile(profileUrl: string): Promise<Result<Profile>> {
    void profileUrl;
    return unsupported();
  }
  async getPublicContents(profileUrl: string): Promise<Result<Content[]>> {
    const profile = await this.getCreatorProfile(profileUrl);
    return profile.data?.contents ? { status: profile.status, data: profile.data.contents } : { status: profile.status === "SUCCESS" ? "NOT_SUPPORTED" : profile.status, reason: profile.reason };
  }
  async getPublicMetrics(profileUrl: string): Promise<Result<{ followers?: bigint }>> {
    const profile = await this.getCreatorProfile(profileUrl);
    return profile.data ? { status: profile.data.followers === undefined ? "PARTIAL" : profile.status, data: { followers: profile.data.followers } } : { status: profile.status, reason: profile.reason };
  }
  refreshCreator(profileUrl: string) { return this.getCreatorProfile(profileUrl); }
}

export function unsupported<T>(reason = "공식 API가 이 조건을 지원하지 않습니다."): Result<T> { return { status: "NOT_SUPPORTED", reason }; }
export function configured<T>(enabled: boolean, work: () => Promise<Result<T>>): Promise<Result<T>> {
  if (!enabled) return Promise.resolve({ status: "AUTH_REQUIRED", reason: "API 키 또는 승인된 토큰을 설정하세요." });
  return work().catch((error: unknown) => error instanceof ProviderFailure
    ? { status: error.status, reason: error.message }
    : { status: "FAILED", reason: "공급자 응답을 처리할 수 없습니다." });
}

export class ProviderFailure extends Error {
  constructor(public status: ProviderStatus, message: string) { super(message); }
}
export async function officialJson(url: URL | string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12_000), cache: "no-store" }); }
  catch { throw new ProviderFailure("UNAVAILABLE", "공식 API 연결 시간이 초과되었거나 연결이 끊겼습니다."); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    if (response.status === 429 || ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason) || [4, 17, 32, 613].includes(body?.error?.code))
      throw new ProviderFailure("RATE_LIMITED", "공식 API 사용량 제한에 도달했습니다.");
    if ([401, 403].includes(response.status) || [10, 190, 200].includes(body?.error?.code))
      throw new ProviderFailure("AUTH_REQUIRED", "공식 API 인증 또는 권한을 확인하세요.");
    throw new ProviderFailure(response.status >= 500 ? "UNAVAILABLE" : "FAILED", "공식 API 요청이 거부되었습니다.");
  }
  return response.json();
}
export function count(value?: string | number) {
  return value !== undefined && /^\d{1,18}$/.test(String(value)) ? BigInt(value) : undefined;
}
export function validDate(value?: string) {
  const date = value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}
