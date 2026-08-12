/**
 * Seed Script — Creates the initial super_admin account
 *
 * Usage: node scripts/seed.js
 *
 * Reads ADMIN_USERNAME and ADMIN_PASSWORD from .env,
 * hashes the password with bcrypt, and upserts the record.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('❌  ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  console.log('🔑  Hashing password...');
  const hashedPassword = await bcrypt.hash(password, 12);

  console.log(`👤  Creating super_admin: ${username}`);

  const admin = await prisma.adminUser.upsert({
    where: { username },
    update: {
      password: hashedPassword,
      role: 'super_admin',
      status: true,
      email: 'habtamudev@gmail.com',
    },
    create: {
      username,
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Admin',
      email: 'habtamudev@gmail.com',
      role: 'super_admin',
      status: true,
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        ✅  Seed Complete!                ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ID       : ${admin.id.toString().padEnd(29)} ║`);
  console.log(`║  Username : ${admin.username.padEnd(29)} ║`);
  console.log(`║  Role     : ${admin.role.padEnd(29)} ║`);
  console.log(`║  Status   : ${String(admin.status).padEnd(29)} ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Also ensure GameSettings singleton exists
  const settings = await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  console.log('⚙️   GameSettings singleton ensured (id: 1)');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
