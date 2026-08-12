/**
 * Unit Tests for Winner Validation Engine
 */

const {
  checkHorizontal,
  checkVertical,
  checkDiagonal,
  checkFourCorners,
  validateWinner,
} = require('../src/services/winnerEngine');
const cardGenerator = require('../src/services/cardGenerator');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

console.log('🧪 Running Winner Engine Unit Tests...\n');

// Standard card setup: cardNumbers in B-I-N-G-O order
// Col 0 (B): 1, 2, 3, 4, 5
// Col 1 (I): 16, 17, 18, 19, 20
// Col 2 (N): 31, 32, 0, 34, 35 (Index 12 is 0 / FREE)
// Col 3 (G): 46, 47, 48, 49, 50
// Col 4 (O): 61, 62, 63, 64, 65
const testCard = [
  1, 2, 3, 4, 5,       // Col 0
  16, 17, 18, 19, 20,  // Col 1
  31, 32, 0, 34, 35,   // Col 2 (Index 12 = FREE space)
  46, 47, 48, 49, 50,  // Col 3
  61, 62, 63, 64, 65   // Col 4
];

// Test 1: Single Horizontal Row (Row 0: 1, 16, 31, 46, 61)
console.log('--- Test 1: Single Horizontal Row ---');
const row0Draws = [1, 16, 31, 46, 61];
assert(checkHorizontal(testCard, row0Draws) === true, 'Horizontal row detected');
assert(checkVertical(testCard, row0Draws) === false, 'Vertical not detected');
assert(checkDiagonal(testCard, row0Draws) === false, 'Diagonal not detected');
assert(checkFourCorners(testCard, row0Draws) === false, 'Four corners not detected');

const singleRowRes = validateWinner(testCard, row0Draws);
assert(singleRowRes.isWinner === false, 'Single pattern (Horizontal) is NOT a winner');
assert(singleRowRes.matchedPatterns.length === 1, 'matchedPatterns count is 1');
assert(singleRowRes.matchedPatterns[0] === 'HORIZONTAL', 'matchedPatterns includes HORIZONTAL');

// Test 2: Single Vertical Column (Col 0: 1, 2, 3, 4, 5)
console.log('\n--- Test 2: Single Vertical Column ---');
const col0Draws = [1, 2, 3, 4, 5];
assert(checkVertical(testCard, col0Draws) === true, 'Vertical column detected');
const singleColRes = validateWinner(testCard, col0Draws);
assert(singleColRes.isWinner === false, 'Single pattern (Vertical) is NOT a winner');
assert(singleColRes.matchedPatterns[0] === 'VERTICAL', 'matchedPatterns includes VERTICAL');

// Test 3: Single Diagonal (TL -> BR: indices 0, 6, 12, 18, 24 -> 1, 17, FREE, 49, 65)
console.log('\n--- Test 3: Single Diagonal ---');
const diagDraws = [1, 17, 49, 65]; // 12 is FREE space (0)
assert(checkDiagonal(testCard, diagDraws) === true, 'Diagonal detected');
const singleDiagRes = validateWinner(testCard, diagDraws);
assert(singleDiagRes.isWinner === false, 'Single pattern (Diagonal) is NOT a winner');

// Test 4: Four Corners (TL:1, TR:61, BL:5, BR:65 -> indices 0, 4, 20, 24)
console.log('\n--- Test 4: Four Corners ---');
const cornersDraws = [1, 5, 61, 65];
assert(checkFourCorners(testCard, cornersDraws) === true, 'Four Corners detected');
const cornersRes = validateWinner(testCard, cornersDraws);
assert(cornersRes.isWinner === false, 'Single pattern (Four Corners) is NOT a winner');

// Test 5: Horizontal + Vertical (Row 0 + Col 0) -> 2 patterns!
console.log('\n--- Test 5: Horizontal + Vertical (2 Patterns = WIN) ---');
const horizVertDraws = [1, 16, 31, 46, 61, 2, 3, 4, 5];
const winRes1 = validateWinner(testCard, horizVertDraws);
assert(winRes1.isWinner === true, 'Horizontal + Vertical IS a WINNER!');
assert(winRes1.matchedPatterns.includes('HORIZONTAL'), 'Contains HORIZONTAL');
assert(winRes1.matchedPatterns.includes('VERTICAL'), 'Contains VERTICAL');

// Test 6: Horizontal + Diagonal
console.log('\n--- Test 6: Horizontal + Diagonal (2 Patterns = WIN) ---');
const horizDiagDraws = [1, 16, 31, 46, 61, 17, 49, 65];
const winRes2 = validateWinner(testCard, horizDiagDraws);
assert(winRes2.isWinner === true, 'Horizontal + Diagonal IS a WINNER!');

// Test 7: Vertical + Four Corners
console.log('\n--- Test 7: Vertical + Four Corners (2 Patterns = WIN) ---');
const vertCornersDraws = [1, 2, 3, 4, 5, 61, 65]; // Col 0 gives Vertical; 1, 5, 61, 65 gives Four Corners
const winRes3 = validateWinner(testCard, vertCornersDraws);
assert(winRes3.isWinner === true, 'Vertical + Four Corners IS a WINNER!');
assert(winRes3.matchedPatterns.includes('VERTICAL'), 'Contains VERTICAL');
assert(winRes3.matchedPatterns.includes('FOUR_CORNERS'), 'Contains FOUR_CORNERS');

// Test 8: Performance Benchmark (500 cards validation after draw)
console.log('\n--- Test 8: Performance Benchmark (500 cards) ---');
const testCards = [];
for (let i = 0; i < 500; i++) {
  testCards.push({ id: i, numbers: cardGenerator.generateCardNumbers() });
}
const sampleDrawn = [1, 5, 12, 17, 22, 31, 40, 46, 50, 61, 65, 70];

const startTime = process.hrtime();
let winnersCount = 0;
for (const card of testCards) {
  const res = validateWinner(card, sampleDrawn);
  if (res.isWinner) winnersCount++;
}
const diff = process.hrtime(startTime);
const durationMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

console.log(`  ⏱️ Validated 500 cards in ${durationMs} ms (Found ${winnersCount} winners)`);
assert(parseFloat(durationMs) < 50, 'Validation of 500 cards executed in under 50ms');

console.log(`\n========================================`);
console.log(`Results: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log(`========================================\n`);

if (testsFailed > 0) {
  process.exit(1);
}
