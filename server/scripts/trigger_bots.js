const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { scheduleBotJoins } = require('../src/services/botEngine');

// Fake IO object to avoid needing full Socket.IO
const fakeIo = {
  to: (room) => ({
    emit: (event, payload) => {
      console.log(`[Socket Emitted] to ${room}: ${event}`, payload);
    }
  })
};

async function main() {
  const waitingGame = await prisma.game.findFirst({
    where: { status: 'waiting' },
    orderBy: { createdAt: 'desc' }
  });

  if (!waitingGame) {
    console.log('No waiting game found. Bots will join the next game automatically.');
    return;
  }

  console.log(`Triggering bot joins for Game #${waitingGame.id}`);
  await scheduleBotJoins(waitingGame.id, fakeIo);
  
  // Keep the process alive a bit so setTimeout in bot engine can fire
  setTimeout(() => {
    console.log('Finished simulating bot joins.');
    process.exit(0);
  }, 6000);
}

main().catch(console.error);
