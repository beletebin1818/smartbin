const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const games = await prisma.game.findMany({
      where: {
        status: { in: ['waiting', 'in_progress'] }
      },
      include: {
        sessions: {
          include: {
            player: true
          }
        }
      }
    });
    console.log('--- Waiting & In Progress Games ---');
    console.log(JSON.stringify(games, null, 2));

    const playersCount = await prisma.player.count();
    console.log('Total players in DB:', playersCount);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
