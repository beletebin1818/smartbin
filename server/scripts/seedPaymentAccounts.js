/**
 * Seed Script — Populates default PaymentAccount records
 *
 * Usage: node scripts/seedPaymentAccounts.js
 *   or:  npm run seed:payment
 *
 * Uses upsert on the unique `method` field so re-running is safe:
 * existing rows are updated in place, no duplicates are ever created.
 */

'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ACCOUNTS = [
  {
    method: 'CBE',
    accountName: 'sewmehon tesfaye',
    accountNumber: '100055067815126',
    isActive: true,
    displayOrder: 1,
  },
  {
    method: 'TeleBirr',
    accountName: 'sewmehon tesfaye',
    accountNumber: '0967328912',
    isActive: true,
    displayOrder: 2,
  },
];

// Support contact username shown in deposit/withdrawal messages
const SUPPORT_USERNAME = '@REDBINGOSUPPORT';

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  💳  Seeding Payment Accounts & Config  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // ── Payment accounts ────────────────────────────────────────────────────
  for (const account of ACCOUNTS) {
    const result = await prisma.paymentAccount.upsert({
      where: { method: account.method },
      update: {
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        isActive: account.isActive,
        displayOrder: account.displayOrder,
      },
      create: account,
    });

    console.log(`  ✅  Upserted: ${result.method}`);
    console.log(`       Name:    ${result.accountName}`);
    console.log(`       Number:  ${result.accountNumber}`);
    console.log(`       Active:  ${result.isActive}`);
    console.log(`       Order:   ${result.displayOrder}`);
    console.log('');
  }

  // ── Support username (GameSettings singleton, id = 1) ───────────────────
  const settings = await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: { supportUsername: SUPPORT_USERNAME },
    create: { id: 1, supportUsername: SUPPORT_USERNAME },
  });

  console.log(`  ✅  GameSettings.supportUsername: ${settings.supportUsername}`);
  console.log('');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  ✅  Payment config seeded successfully! ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
