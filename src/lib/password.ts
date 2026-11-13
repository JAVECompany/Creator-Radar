import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function matchesPassword(password: string, stored?: string) {
  const [salt, encoded] = (stored ?? "").split(":");
  const expected = encoded ? Buffer.from(encoded, "hex") : Buffer.alloc(64);
  const actual = await derive(password, salt || "00000000000000000000000000000000", 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual) && Boolean(stored);
}
