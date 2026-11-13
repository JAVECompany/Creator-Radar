import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

if (existsSync(".env")) loadEnvFile();
const directory = resolve(".next", "standalone");
if (!existsSync(resolve(directory, "server.js"))) {
  console.error("프로덕션 빌드가 필요합니다. pnpm build를 먼저 실행하세요.");
  process.exit(1);
}
mkdirSync(resolve(directory, ".next"), { recursive: true });
cpSync(".next/static", resolve(directory, ".next/static"), { recursive: true });
if (existsSync("public")) cpSync("public", resolve(directory, "public"), { recursive: true });
await import(pathToFileURL(resolve(directory, "server.js")).href);
