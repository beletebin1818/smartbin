const util = require('util');

function callerInfo() {
  const stack = new Error().stack || '';
  const lines = stack.split('\n').map(l => l.trim());
  // lines[0] = Error, lines[1] = this function, lines[2] = caller
  return lines[2] || lines[1] || '';
}

function logPrizeUpdate({ gameId, action, amount, before = null, after = null, source = 'unknown' }) {
  const ts = new Date().toISOString();
  const pid = process.pid;
  const caller = callerInfo();
  console.log(`[PRIZE_LOG] ${ts} | pid=${pid} | game=${gameId} | action=${action} | amount=${amount} | before=${before} | after=${after} | source=${source} | caller=${caller}`);
}

module.exports = { logPrizeUpdate };
