/**
 * Red Bingo Authoritative Winner Engine
 * Service for deterministic, high-performance winner validation based on the 2-pattern win rule.
 * 
 * Winning Patterns:
 * 1. Complete Horizontal Row ("HORIZONTAL")
 * 2. Complete Vertical Column ("VERTICAL")
 * 3. Complete Diagonal ("DIAGONAL") — Either top-left -> bottom-right OR top-right -> bottom-left
 * 4. Four Corners ("FOUR_CORNERS") — Top-left, top-right, bottom-left, bottom-right
 * 
 * Winner Rule:
 * A player wins ONLY when their card satisfies ANY TWO DIFFERENT winning patterns (matchedPatterns.length >= 2).
 */

// Column-major grid index mappings (0 to 24)
const GRID_PATTERNS = {
  HORIZONTAL_ROWS: [
    [0, 5, 10, 15, 20], // Row 0
    [1, 6, 11, 16, 21], // Row 1
    [2, 7, 12, 17, 22], // Row 2 (includes index 12 FREE space)
    [3, 8, 13, 18, 23], // Row 3
    [4, 9, 14, 19, 24]  // Row 4
  ],
  VERTICAL_COLUMNS: [
    [0, 1, 2, 3, 4],       // Col 0 (B)
    [5, 6, 7, 8, 9],       // Col 1 (I)
    [10, 11, 12, 13, 14],  // Col 2 (N) (includes index 12 FREE space)
    [15, 16, 17, 18, 19],  // Col 3 (G)
    [20, 21, 22, 23, 24]   // Col 4 (O)
  ],
  DIAGONALS: [
    [0, 6, 12, 18, 24],    // Top-Left to Bottom-Right
    [20, 16, 12, 8, 4]     // Top-Right to Bottom-Left
  ],
  FOUR_CORNERS: [
    [0, 4, 20, 24]         // Top-Left (0), Bottom-Left (4), Top-Right (20), Bottom-Right (24)
  ]
};

/**
 * Normalizes input parameters into cardNumbers array, markedCells array, and drawn Set.
 */
function normalizeInputs(card, drawnInput) {
  let cardNumbers = null;
  let markedCells = null;

  if (Array.isArray(card)) {
    cardNumbers = card;
  } else if (card && typeof card === 'object') {
    cardNumbers = card.numbers || card.cardSnapshot || null;
    markedCells = card.markedCells || null;
  }

  let drawnSet = null;
  if (drawnInput instanceof Set) {
    drawnSet = drawnInput;
  } else if (Array.isArray(drawnInput)) {
    drawnSet = new Set(drawnInput);
  } else {
    drawnSet = new Set();
  }

  return { cardNumbers, markedCells, drawnSet };
}

/**
 * Checks if a specific cell index is marked (drawn, free space 0, or markedCell boolean).
 */
function isCellMarked(cardNumbers, markedCells, drawnSet, index) {
  if (index === 12) return true; // Center space is always FREE
  if (markedCells && markedCells[index] === true) return true;
  if (!cardNumbers) return false;
  const val = cardNumbers[index];
  if (val === 0) return true;
  return drawnSet.has(val);
}

/**
 * Checks if a card satisfies any complete Horizontal row.
 * @param {object|number[]} card - BingoCard object or array of 25 card numbers
 * @param {number[]|Set<number>} drawnInput - Array or Set of drawn numbers
 * @returns {boolean}
 */
function checkHorizontal(card, drawnInput) {
  const { cardNumbers, markedCells, drawnSet } = normalizeInputs(card, drawnInput);
  for (const row of GRID_PATTERNS.HORIZONTAL_ROWS) {
    if (row.every(idx => isCellMarked(cardNumbers, markedCells, drawnSet, idx))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a card satisfies any complete Vertical column.
 * @param {object|number[]} card - BingoCard object or array of 25 card numbers
 * @param {number[]|Set<number>} drawnInput - Array or Set of drawn numbers
 * @returns {boolean}
 */
function checkVertical(card, drawnInput) {
  const { cardNumbers, markedCells, drawnSet } = normalizeInputs(card, drawnInput);
  for (const col of GRID_PATTERNS.VERTICAL_COLUMNS) {
    if (col.every(idx => isCellMarked(cardNumbers, markedCells, drawnSet, idx))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a card satisfies any complete Diagonal.
 * @param {object|number[]} card - BingoCard object or array of 25 card numbers
 * @param {number[]|Set<number>} drawnInput - Array or Set of drawn numbers
 * @returns {boolean}
 */
function checkDiagonal(card, drawnInput) {
  const { cardNumbers, markedCells, drawnSet } = normalizeInputs(card, drawnInput);
  for (const diag of GRID_PATTERNS.DIAGONALS) {
    if (diag.every(idx => isCellMarked(cardNumbers, markedCells, drawnSet, idx))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a card satisfies Four Corners (top-left, top-right, bottom-left, bottom-right).
 * @param {object|number[]} card - BingoCard object or array of 25 card numbers
 * @param {number[]|Set<number>} drawnInput - Array or Set of drawn numbers
 * @returns {boolean}
 */
function checkFourCorners(card, drawnInput) {
  const { cardNumbers, markedCells, drawnSet } = normalizeInputs(card, drawnInput);
  const corners = GRID_PATTERNS.FOUR_CORNERS[0];
  return corners.every(idx => isCellMarked(cardNumbers, markedCells, drawnSet, idx));
}

/**
 * Validates whether a card is a winner according to the 2-pattern rule.
 * Evaluate all four winning patterns independently, count satisfied pattern types.
 * 
 * @param {object|number[]} card - BingoCard object or 25 numbers array
 * @param {number[]|Set<number>} drawnInput - Array or Set of drawn numbers
 * @returns {{ isWinner: boolean, matchedPatterns: string[] }}
 */
function validateWinner(card, drawnInput) {
  const matchedPatterns = [];

  if (checkHorizontal(card, drawnInput)) {
    matchedPatterns.push("HORIZONTAL");
  }
  if (checkVertical(card, drawnInput)) {
    matchedPatterns.push("VERTICAL");
  }
  if (checkDiagonal(card, drawnInput)) {
    matchedPatterns.push("DIAGONAL");
  }
  if (checkFourCorners(card, drawnInput)) {
    matchedPatterns.push("FOUR_CORNERS");
  }

  const isWinner = matchedPatterns.length >= 2;

  return {
    isWinner,
    matchedPatterns,
  };
}

module.exports = {
  checkHorizontal,
  checkVertical,
  checkDiagonal,
  checkFourCorners,
  validateWinner,
  GRID_PATTERNS,
};
