import type { Platform } from "@prisma/client";

export const platforms = ["INSTAGRAM", "YOUTUBE", "TIKTOK"] as const satisfies readonly Platform[];
export type SupportedPlatform = (typeof platforms)[number];

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platforms.some((supported) => supported === platform);
}
