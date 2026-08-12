/**
 * Seed Script — Populates default AgentBankAccount records
 *
 * Usage: node scripts/seedAgentBankAccounts.js
 */

'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AGENT_ACCOUNTS = [
  {
    agentUsername: 'test_agent_bank_4721',
    accounts: [
      { method: 'CBE', accountName: 'alemu bisetegn', accountNumber: '100055067815126', isActive: true, displayOrder: 1 },
      { method: 'TeleBirr', accountName: 'alemu bisetegn', accountNumber: '0967328912', isActive: true, displayOrder: 1 },
    ]
  },
  {
    agentUsername: '@efi.de',
    accounts: [
      { method: 'CBE', accountName: 'tarekegn temesgen', accountNumber: '100055067815127', isActive: true, displayOrder: 1 },
      { method: 'TeleBirr', accountName: 'tarekegn temesgen', accountNumber: '0967328913', isActive: true, displayOrder: 1 },
    ]
  },
  {
    agentUsername: 'efi',
    accounts: [
      { method: 'CBE', accountName: 'tadi', accountNumber: '100055067815128', isActive: true, displayOrder: 1 },
      { method: 'TeleBirr', accountName: 'tadi', accountNumber: '0967328914', isActive: true, displayOrder: 1 },
    ]
  },
  {
    agentUsername: 'test1221',
    accounts: [
      { method: 'CBE', accountName: 'test', accountNumber: '100055067815129', isActive: true, displayOrder: 1 },
      { method: 'TeleBirr', accountName: 'test', accountNumber: '0967328915', isActive: true, displayOrder: 1 },
    ]
  },
];

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  💳  Seeding Agent Bank Accounts         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  for (const agentConfig of AGENT_ACCOUNTS) {
    const agent = await prisma.agent.findUnique({
      where: { username: agentConfig.agentUsername },
    });

    if (!agent) {
      console.log(`  ⚠️  Agent not found: ${agentConfig.agentUsername}`);
      continue;
    }

    for (const acc of agentConfig.accounts) {
      // Check if account already exists for this agent + method + number
      const existing = await prisma.agentBankAccount.findFirst({
        where: {
          agentId: agent.id,
          method: acc.method,
          accountNumber: acc.accountNumber,
        },
      });

      if (existing) {
        await prisma.agentBankAccount.update({
          where: { id: existing.id },
          data: {
            accountName: acc.accountName,
            isActive: acc.isActive,
            displayOrder: acc.displayOrder,
          },
        });
        console.log(`  🔄  Updated: ${agentConfig.agentUsername} → ${acc.method}: ${acc.accountName} - ${acc.accountNumber}`);
      } else {
        await prisma.agentBankAccount.create({
          data: {
            agentId: agent.id,
            method: acc.method,
            accountName: acc.accountName,
            accountNumber: acc.accountNumber,
            isActive: acc.isActive,
            displayOrder: acc.displayOrder,
          },
        });
        console.log(`  ✅  Created: ${agentConfig.agentUsername} → ${acc.method}: ${acc.accountName} - ${acc.accountNumber}`);
      }
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  ✅  Agent bank accounts seeded!         ║');
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
