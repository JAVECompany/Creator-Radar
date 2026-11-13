import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export function check(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(status, "REQUEST_REJECTED", message);
}
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
}
export function safeError(error: unknown) {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError(400, "INVALID_INPUT", "입력값을 확인해 주세요.");
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new AppError(409, "CONFLICT", "이미 등록된 정보입니다.");
    if (error.code === "P2025") return new AppError(404, "NOT_FOUND", "대상을 찾을 수 없습니다.");
  }
  log("error", "request_failed", { kind: error instanceof Error ? error.name : "unknown" });
  return new AppError(500, "INTERNAL", "처리 중 문제가 발생했습니다.");
}
export function apiError(error: unknown) {
  const { status, code, message } = safeError(error);
  return Response.json({ ok: false, error: { code, message } }, { status });
}
