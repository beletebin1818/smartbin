const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const res = await prisma.$queryRawUnsafe('select 1 as value');
    console.log('CONNECTED', res);
  } catch (error) {
    console.error('PRISMA_ERR', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();