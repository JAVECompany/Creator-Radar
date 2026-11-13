import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as typeof globalThis & { radarDatabase?: PrismaClient };
export const db = globalDatabase.radarDatabase ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDatabase.radarDatabase = db;
