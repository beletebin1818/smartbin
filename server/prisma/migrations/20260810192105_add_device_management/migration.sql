-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "cbeAccount" TEXT,
ADD COLUMN     "cbeHolder" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'agent',
ADD COLUMN     "telebirrHolder" TEXT,
ADD COLUMN     "telebirrPhone" TEXT;

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'global',
ADD COLUMN     "sentBy" TEXT,
ADD COLUMN     "targetCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GameSettings" ADD COLUMN     "agentWithdrawalCooldown" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "allowAgentRegistration" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "announceBetweenGames" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoRestartNextGame" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "botDifficulty" TEXT NOT NULL DEFAULT 'Medium',
ADD COLUMN     "debugLogging" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "joinWindowDuration" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxConcurrentGames" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maximumAgentPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "minimumAgentPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "numberOfBots" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "platformName" TEXT NOT NULL DEFAULT 'Red Bingo',
ADD COLUMN     "requireAgentApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionTimeoutMins" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "GameWinner" ADD COLUMN     "bingoCardId" INTEGER,
ADD COLUMN     "drawIndex" INTEGER,
ADD COLUMN     "drawNumber" INTEGER,
ADD COLUMN     "gameDuration" INTEGER,
ADD COLUMN     "winningPatterns" TEXT[];

-- AlterTable
ALTER TABLE "PendingRequest" ADD COLUMN     "accountHolder" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "processedById" INTEGER,
ADD COLUMN     "transactionId" TEXT;

-- CreateTable
CREATE TABLE "AgentBankAccount" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositVerification" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "smsText" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "smsData" JSONB NOT NULL,
    "receiptData" JSONB,
    "verificationStatus" TEXT NOT NULL,
    "mismatchFields" JSONB,
    "transactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pendingRequestId" INTEGER,

    CONSTRAINT "DepositVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "userType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "replacedByToken" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "userType" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceType" TEXT,
    "platform" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPendingApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" INTEGER,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userType" TEXT,
    "username" TEXT,
    "ipAddress" TEXT,
    "deviceFingerprint" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "userType" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "deviceId" INTEGER,
    "loginAttemptId" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentBankAccount_agentId_method_isActive_idx" ON "AgentBankAccount"("agentId", "method", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgentBankAccount_agentId_method_accountNumber_key" ON "AgentBankAccount"("agentId", "method", "accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DepositVerification_transactionId_key" ON "DepositVerification"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositVerification_pendingRequestId_key" ON "DepositVerification"("pendingRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_userType_idx" ON "RefreshToken"("userId", "userType");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceFingerprint_key" ON "Device"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "Device_userId_userType_idx" ON "Device"("userId", "userType");

-- CreateIndex
CREATE INDEX "Device_deviceFingerprint_idx" ON "Device"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "Device_ipAddress_idx" ON "Device"("ipAddress");

-- CreateIndex
CREATE INDEX "Device_isPendingApproval_idx" ON "Device"("isPendingApproval");

-- CreateIndex
CREATE INDEX "LoginAttempt_userId_idx" ON "LoginAttempt"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_idx" ON "LoginAttempt"("ipAddress");

-- CreateIndex
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_success_idx" ON "LoginAttempt"("success");

-- CreateIndex
CREATE INDEX "SecurityAlert_userId_userType_idx" ON "SecurityAlert"("userId", "userType");

-- CreateIndex
CREATE INDEX "SecurityAlert_alertType_idx" ON "SecurityAlert"("alertType");

-- CreateIndex
CREATE INDEX "SecurityAlert_isRead_idx" ON "SecurityAlert"("isRead");

-- CreateIndex
CREATE INDEX "SecurityAlert_createdAt_idx" ON "SecurityAlert"("createdAt");

-- AddForeignKey
ALTER TABLE "AgentBankAccount" ADD CONSTRAINT "AgentBankAccount_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWinner" ADD CONSTRAINT "GameWinner_bingoCardId_fkey" FOREIGN KEY ("bingoCardId") REFERENCES "BingoCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRequest" ADD CONSTRAINT "PendingRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositVerification" ADD CONSTRAINT "DepositVerification_pendingRequestId_fkey" FOREIGN KEY ("pendingRequestId") REFERENCES "PendingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
