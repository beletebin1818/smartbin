-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "failedOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastOtpAttemptAt" TIMESTAMP(3);
