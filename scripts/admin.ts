import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = z.email().max(254).safeParse(process.env.ADMIN_EMAIL?.trim().toLowerCase());
  if (!email.success) throw new AdminSetupError("ADMIN_EMAIL에 올바른 이메일 주소를 입력하세요.");

  const password = z.string().min(14).max(256).safeParse(process.env.ADMIN_PASSWORD);
  if (!password.success) throw new AdminSetupError("ADMIN_PASSWORD는 14~256자여야 합니다.");

  await db.user.create({ data: { email: email.data, passwordHash: await hashPassword(password.data) } });
  console.info("관리자 계정을 생성했습니다.");
}
class AdminSetupError extends Error {}

main().catch((error: unknown) => {
  if (error instanceof AdminSetupError) console.error(error.message);
  else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    console.error("이 이메일로 등록된 관리자 계정이 이미 있습니다.");
  else console.error("관리자 생성 실패. PostgreSQL 연결과 마이그레이션 적용 여부를 확인하세요.");
  process.exitCode = 1;
})
  .finally(() => db.$disconnect());
