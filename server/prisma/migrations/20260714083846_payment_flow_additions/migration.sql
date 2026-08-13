-- AlterTable
ALTER TABLE "GameSettings" ADD COLUMN     "supportUsername" TEXT NOT NULL DEFAULT '@REDBINGOSUPPORT';

-- AlterTable
ALTER TABLE "PendingRequest" ADD COLUMN     "method" TEXT,
ADD COLUMN     "smsProof" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "method" TEXT,
ADD COLUMN     "pendingRequestId" INTEGER,
ADD COLUMN     "smsProof" TEXT;

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);
