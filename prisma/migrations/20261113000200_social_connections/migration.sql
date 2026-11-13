ALTER TYPE "Platform" ADD VALUE 'FACEBOOK';
ALTER TYPE "Platform" ADD VALUE 'THREADS';

CREATE TABLE "TikTokConnection" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "openId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accessCiphertext" TEXT NOT NULL,
    "refreshCiphertext" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TikTokConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TikTokConnection_openId_key" ON "TikTokConnection"("openId");
CREATE UNIQUE INDEX "TikTokConnection_handle_key" ON "TikTokConnection"("handle");
CREATE INDEX "TikTokConnection_ownerId_idx" ON "TikTokConnection"("ownerId");
ALTER TABLE "TikTokConnection" ADD CONSTRAINT "TikTokConnection_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
