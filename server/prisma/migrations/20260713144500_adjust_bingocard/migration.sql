-- DropForeignKey
ALTER TABLE "BingoCard" DROP CONSTRAINT "BingoCard_playerId_fkey";

-- DropForeignKey
ALTER TABLE "BingoCard" DROP CONSTRAINT "BingoCard_sessionId_fkey";

-- AlterTable
ALTER TABLE "GameSettings" ADD COLUMN     "maxCardsPerPlayer" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "BingoCard" ADD COLUMN     "cardNumber" INTEGER NOT NULL,
ADD COLUMN     "gameId" INTEGER NOT NULL,
ALTER COLUMN "playerId" DROP NOT NULL,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BingoCard_gameId_cardNumber_key" ON "BingoCard"("gameId", "cardNumber");

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCard" ADD CONSTRAINT "BingoCard_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
