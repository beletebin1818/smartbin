-- CreateTable
CREATE TABLE "DeviceApprovalOtp" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceApprovalOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceApprovalOtp_deviceId_idx" ON "DeviceApprovalOtp"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceApprovalOtp_code_idx" ON "DeviceApprovalOtp"("code");

-- CreateIndex
CREATE INDEX "DeviceApprovalOtp_expiresAt_idx" ON "DeviceApprovalOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "DeviceApprovalOtp_createdAt_idx" ON "DeviceApprovalOtp"("createdAt");
