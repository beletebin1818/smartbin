/**
 * Bingo Card Generator Service
 *
 * Generates 25 numbers in B-I-N-G-O column order:
 * - B: 5 random unique numbers from 1 to 15
 * - I: 5 random unique numbers from 16 to 30
 * - N: 5 random unique numbers from 31 to 45 (center space at index 12 is 0 / FREE)
 * - G: 5 random unique numbers from 46 to 60
 * - O: 5 random unique numbers from 61 to 75
 */

/**
 * Helper to generate N unique random numbers in a range [min, max]
 * @param {number} count - number of unique numbers needed
 * @param {number} min - minimum value (inclusive)
 * @param {number} max - maximum value (inclusive)
 * @returns {number[]}
 */
function getUniqueRandomNumbers(count, min, max) {
  const pool = [];
  for (let i = min; i <= max; i++) {
    pool.push(i);
  }

  const result = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    result.push(pool[randomIndex]);
    pool.splice(randomIndex, 1); // remove to prevent duplicate
  }
  return result;
}

/**
 * Generates a valid 25-number Bingo card array
 * @returns {number[]}
 */
function generateCardNumbers() {
  const b = getUniqueRandomNumbers(5, 1, 15);
  const i = getUniqueRandomNumbers(5, 16, 30);
  const n = getUniqueRandomNumbers(5, 31, 45);
  const g = getUniqueRandomNumbers(5, 46, 60);
  const o = getUniqueRandomNumbers(5, 61, 75);

  // Set the center of the card (3rd element in N, which is index 12 in column order) to 0 (FREE space)
  n[2] = 0;

  // Combine columns in B-I-N-G-O order
  return [...b, ...i, ...n, ...g, ...o];
}

/**
 * Generates card pool data for a given game ID and total cards count
 * @param {number} gameId
 * @param {number} count
 * @returns {object[]} array of BingoCard data configurations
 */
function generateCardPool(gameId, count) {
  const cards = [];
  for (let cardNumber = 1; cardNumber <= count; cardNumber++) {
    const numbers = generateCardNumbers();
    // Default markedCells: 25-element boolean array, where index 12 (center FREE space) is true, others false
    const markedCells = Array(25).fill(false);
    markedCells[12] = true;

    cards.push({
      gameId,
      cardNumber,
      numbers,
      markedCells,
      isWinner: false,
    });
  }
  return cards;
}

module.exports = {
  generateCardNumbers,
  generateCardPool,
};
