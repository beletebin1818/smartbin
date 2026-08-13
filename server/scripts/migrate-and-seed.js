/**
 * Migration & Seed Script for Render Deployment
 * 
 * Runs:
 * 1. Prisma migrate deploy (applies all pending migrations)
 * 2. Seed initial data (admin user + game settings)
 */

const { spawn } = require('child_process');
require('dotenv').config();

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  try {
    console.log('🔄  Starting migration and seeding process...\n');

    // Step 1: Run Prisma migrations
    console.log('📊  Running Prisma migrations...');
    await runCommand('npx', ['prisma', 'migrate', 'deploy', '--skip-generate']);
    console.log('✅  Migrations completed!\n');

    // Step 2: Run seed script
    console.log('🌱  Seeding initial data...');
    await runCommand('node', ['scripts/seed.js']);
    console.log('✅  Seed completed!\n');

    console.log('═══════════════════════════════════════');
    console.log('✅  All migration and seed tasks done!');
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('❌  Error during migration/seed:', error.message);
    process.exit(1);
  }
}

main();
