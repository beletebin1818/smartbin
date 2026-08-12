const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: {
      botsEnabled: true,
      minBotPlayers: 10,
      maxBotPlayers: 25,
      botMinCards: 1,
      botMaxCards: 3
    },
    create: {
      id: 1,
      botsEnabled: true,
      minBotPlayers: 10,
      maxBotPlayers: 25,
      botMinCards: 1,
      botMaxCards: 3
    }
  });
  console.log('Bot settings updated in database.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
