import { FacebookProvider } from "./facebook";
import { InstagramProvider } from "./instagram";
import { ThreadsProvider } from "./threads";
import { YouTubeProvider } from "./youtube";

export const providers = {
  INSTAGRAM: new InstagramProvider(),
  FACEBOOK: new FacebookProvider(),
  THREADS: new ThreadsProvider(),
  YOUTUBE: new YouTubeProvider(),
};
