/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `AdminUser` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
