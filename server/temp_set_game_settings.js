const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.gameSettings.upsert({
      where: { id: 1 },
      update: {
        botsEnabled: false,
        minBotPlayers: 0,
        maxBotPlayers: 0,
      },
      create: {
        id: 1,
        botsEnabled: false,
        minBotPlayers: 0,
        maxBotPlayers: 0,
        minBet: 10,
        maxBet: 500,
        maxPlayers: 100,
        maxCardsPerPlayer: 5,
        totalCards: 400,
        initialJoinBonus: 10,
        winningLineCount: 1,
        allowJoinCancel: true,
        allowAutoBets: true,
        allowManualBets: true,
        gameStatus: 'open',
        lobbySeconds: 15,
        drawInterval: 4,
        showBotLabels: true,
        botMinCards: 1,
        botMaxCards: 2,
        botJoinDelayMin: 100,
        botJoinDelayMax: 500,
      },
    });
    console.log('Updated GameSettings.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
