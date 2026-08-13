-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminRole" ADD VALUE 'moderator';
ALTER TYPE "AdminRole" ADD VALUE 'support';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "jobTitle" TEXT;

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);
