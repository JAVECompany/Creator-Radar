import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { check } from "./errors";

function key() {
  const value = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  check(value.length === 32, "토큰 암호화 키를 설정하세요.", 503);
  return value;
}
export function encrypt(value: string, context: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}
export function decrypt(value: string, context: string) {
  const [nonce, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function equals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
