const fs = require('fs');
const path = require('path');
const nextDir = path.resolve(__dirname, '..', '..', '..', '.next');

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log('Removed stale .next directory');
  }
} catch (err) {
  console.error('Failed to remove .next directory:', err.message);
  process.exit(1);
}
