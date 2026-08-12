const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const game = await prisma.game.findFirst({
    where: { status: { in: ['in_progress', 'waiting'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      sessions: {
        include: {
          player: true,
          cards: true
        }
      },
      cards: {
        where: { playerId: { not: null } }
      }
    }
  });
  if (!game) {
    console.log("No waiting/in_progress game found.");
  } else {
    console.log(`Game ID: ${game.id}, Status: ${game.status}, CardPrice: ${game.cardPrice}, Prize: ${game.prize}`);
    console.log(`Sessions count: ${game.sessions.length}`);
    for (const s of game.sessions) {
      console.log(`  Session ID: ${s.id}, Player ID: ${s.playerId}, Name: ${s.player.firstName}, isBot: ${s.player.isBot}, Bet: ${s.bet}, CardCount: ${s.cardCount}, TotalBet: ${s.totalBet}, CardsInSession: ${s.cards.length}`);
    }
    console.log(`Claimed cards total: ${game.cards.length}`);
  }
  await prisma.$disconnect();
}

run().catch(console.error);
