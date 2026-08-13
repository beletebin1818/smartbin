-- AlterTable
ALTER TABLE "GameSettings" ADD COLUMN     "activePatterns" TEXT NOT NULL DEFAULT 'row,column,diagonal,blackout',
ADD COLUMN     "drawInterval" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "houseEdge" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
ADD COLUMN     "lobbySeconds" INTEGER NOT NULL DEFAULT 15;
