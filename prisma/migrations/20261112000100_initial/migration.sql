-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'NAVER_BLOG');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('MANUAL', 'OFFICIAL_API');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CLEARED', 'HOLD');

-- CreateEnum
CREATE TYPE "AdultStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "DetectionStatus" AS ENUM ('UNKNOWN', 'NONE', 'DETECTED', 'REVIEW');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('COSPLAY', 'FASHION', 'MODEL', 'SWIMWEAR', 'LINGERIE', 'BODY_PROFILE', 'ART_NUDE', 'ADULT_ORIENTED_TEXT', 'OTHER');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('DISCOVERY', 'REFRESH', 'ANALYSIS', 'SUBSCRIPTIONS', 'METRICS', 'DM_SEND', 'RETENTION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DmStatus" AS ENUM ('NOT_CONTACTED', 'DRAFT', 'QUEUED', 'SENDING', 'SENT', 'MANUALLY_SENT', 'FAILED', 'NOT_ELIGIBLE', 'REPLIED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('API', 'MANUAL');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('CANDIDATE', 'REVIEWING', 'CONTACT_READY', 'CONTACTED', 'REPLIED', 'INTERESTED', 'DEMO', 'APPLIED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SearchPreset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "adultStatus" "AdultStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "adultEvidence" TEXT,
    "adultVerifiedAt" TIMESTAMP(3),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "businessContact" BOOLEAN,
    "score" DOUBLE PRECISION,
    "scoreEvidence" JSONB,
    "scoredAt" TIMESTAMP(3),
    "contactStatus" "DmStatus" NOT NULL DEFAULT 'NOT_CONTACTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorPlatformAccount" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "source" "Source" NOT NULL,
    "externalId" TEXT,
    "handle" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "links" TEXT[],
    "followers" BIGINT,
    "lastActiveAt" TIMESTAMP(3),
    "engagement" DOUBLE PRECISION,
    "collectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "detectionStatus" "DetectionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "detectedAt" TIMESTAMP(3),
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorPlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorContent" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "source" "Source" NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorMetricSnapshot" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "followers" BIGINT,
    "engagement" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "jobId" UUID,
    "model" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "manuallyReviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisEvidence" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "category" "Category" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "AnalysisEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlatform" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlatformAlias" (
    "id" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "isDomain" BOOLEAN NOT NULL DEFAULT false,
    "ambiguous" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SubscriptionPlatformAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorSubscriptionPlatform" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorSubscriptionPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlatformEvidence" (
    "id" UUID NOT NULL,
    "detectionId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "matched" TEXT NOT NULL,
    "ambiguous" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SubscriptionPlatformEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "actorId" UUID,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRequestLog" (
    "id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "count" INTEGER,
    "jobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "instagramId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tokenCiphertext" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "digest" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("digest")
);

-- CreateTable
CREATE TABLE "InstagramCorrespondent" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "scopedId" TEXT NOT NULL,
    "accountId" UUID,
    "linkEvidence" TEXT,
    "lastInboundAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramCorrespondent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramEvent" (
    "messageId" TEXT NOT NULL,
    "connectionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramEvent_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "DMTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DMTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMCampaign" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMMessage" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "connectionId" UUID,
    "sender" TEXT,
    "recipientScopedId" TEXT,
    "campaignId" UUID,
    "templateId" UUID,
    "actorId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DmStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "DeliveryMethod" NOT NULL,
    "followUpToId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "apiMessageId" TEXT,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "jobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DMMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMDeliveryAttempt" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "errorCode" TEXT,

    CONSTRAINT "DMDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMStatusHistory" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "status" "DmStatus" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentCandidate" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "stage" "RecruitmentStage" NOT NULL DEFAULT 'CANDIDATE',
    "assigneeId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentActivity" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "stage" "RecruitmentStage" NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentNote" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CreatorToTag" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CreatorToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_createdAt_idx" ON "AuditLog"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "RateBucket_expiresAt_idx" ON "RateBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchPreset_ownerId_name_key" ON "SearchPreset"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Creator_createdAt_idx" ON "Creator"("createdAt");

-- CreateIndex
CREATE INDEX "Creator_contactStatus_idx" ON "Creator"("contactStatus");

-- CreateIndex
CREATE INDEX "CreatorPlatformAccount_creatorId_idx" ON "CreatorPlatformAccount"("creatorId");

-- CreateIndex
CREATE INDEX "CreatorPlatformAccount_platform_followers_idx" ON "CreatorPlatformAccount"("platform", "followers");

-- CreateIndex
CREATE INDEX "CreatorPlatformAccount_expiresAt_idx" ON "CreatorPlatformAccount"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPlatformAccount_platform_externalId_key" ON "CreatorPlatformAccount"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPlatformAccount_platform_profileUrl_key" ON "CreatorPlatformAccount"("platform", "profileUrl");

-- CreateIndex
CREATE INDEX "CreatorContent_accountId_publishedAt_idx" ON "CreatorContent"("accountId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorContent_accountId_url_key" ON "CreatorContent"("accountId", "url");

-- CreateIndex
CREATE INDEX "CreatorMetricSnapshot_accountId_capturedAt_idx" ON "CreatorMetricSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_jobId_key" ON "AnalysisResult"("jobId");

-- CreateIndex
CREATE INDEX "AnalysisResult_accountId_createdAt_idx" ON "AnalysisResult"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisEvidence_category_idx" ON "AnalysisEvidence"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlatform_name_key" ON "SubscriptionPlatform"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlatformAlias_platformId_value_isDomain_key" ON "SubscriptionPlatformAlias"("platformId", "value", "isDomain");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorSubscriptionPlatform_accountId_platformId_key" ON "CreatorSubscriptionPlatform"("accountId", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_status_leaseUntil_idx" ON "Job"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "ProviderRequestLog_platform_createdAt_idx" ON "ProviderRequestLog"("platform", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_instagramId_key" ON "InstagramConnection"("instagramId");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramCorrespondent_connectionId_scopedId_key" ON "InstagramCorrespondent"("connectionId", "scopedId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramCorrespondent_connectionId_accountId_key" ON "InstagramCorrespondent"("connectionId", "accountId");

-- CreateIndex
CREATE INDEX "InstagramEvent_createdAt_idx" ON "InstagramEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DMTemplate_name_key" ON "DMTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DMMessage_idempotencyKey_key" ON "DMMessage"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DMMessage_apiMessageId_key" ON "DMMessage"("apiMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DMMessage_jobId_key" ON "DMMessage"("jobId");

-- CreateIndex
CREATE INDEX "DMMessage_accountId_status_idx" ON "DMMessage"("accountId", "status");

-- CreateIndex
CREATE INDEX "DMMessage_status_createdAt_idx" ON "DMMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DMStatusHistory_messageId_createdAt_idx" ON "DMStatusHistory"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentCandidate_creatorId_key" ON "RecruitmentCandidate"("creatorId");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_active_stage_idx" ON "RecruitmentCandidate"("active", "stage");

-- CreateIndex
CREATE INDEX "RecruitmentActivity_candidateId_createdAt_idx" ON "RecruitmentActivity"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "RecruitmentNote_creatorId_createdAt_idx" ON "RecruitmentNote"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "_CreatorToTag_B_index" ON "_CreatorToTag"("B");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPlatformAccount" ADD CONSTRAINT "CreatorPlatformAccount_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorContent" ADD CONSTRAINT "CreatorContent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorMetricSnapshot" ADD CONSTRAINT "CreatorMetricSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisEvidence" ADD CONSTRAINT "AnalysisEvidence_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AnalysisResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlatformAlias" ADD CONSTRAINT "SubscriptionPlatformAlias_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "SubscriptionPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorSubscriptionPlatform" ADD CONSTRAINT "CreatorSubscriptionPlatform_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorSubscriptionPlatform" ADD CONSTRAINT "CreatorSubscriptionPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "SubscriptionPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlatformEvidence" ADD CONSTRAINT "SubscriptionPlatformEvidence_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "CreatorSubscriptionPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramCorrespondent" ADD CONSTRAINT "InstagramCorrespondent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramCorrespondent" ADD CONSTRAINT "InstagramCorrespondent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorPlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DMCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DMTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMDeliveryAttempt" ADD CONSTRAINT "DMDeliveryAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMStatusHistory" ADD CONSTRAINT "DMStatusHistory_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentActivity" ADD CONSTRAINT "RecruitmentActivity_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentNote" ADD CONSTRAINT "RecruitmentNote_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatorToTag" ADD CONSTRAINT "_CreatorToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatorToTag" ADD CONSTRAINT "_CreatorToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
