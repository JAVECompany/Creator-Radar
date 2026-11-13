import { InstagramProvider } from "./instagram";
import { NaverBlogProvider } from "./naver";
import { TikTokProvider } from "./tiktok";
import { YouTubeProvider } from "./youtube";

export const providers = {
  INSTAGRAM: new InstagramProvider(),
  YOUTUBE: new YouTubeProvider(),
  TIKTOK: new TikTokProvider(),
  NAVER_BLOG: new NaverBlogProvider(),
};
