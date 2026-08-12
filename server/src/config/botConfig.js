/**
 * Bot System Default Configuration
 *
 * These values mirror the bot-related columns added to the GameSettings
 * table in the database.  They serve as the authoritative in-code defaults
 * and can be used for validation, seeding, or fallback logic anywhere in
 * the application without touching the database.
 *
 * IMPORTANT: Do NOT implement bot logic here.  This file is purely a
 * configuration/constants module – no side effects, no DB calls.
 */

const botConfig = {
  /**
   * Whether the bot system is enabled globally.
   * Mirrors: GameSettings.botsEnabled
   */
  botsEnabled: true,

  /**
   * Minimum number of bot players that should join a game when the bot
   * system is active.
   * Mirrors: GameSettings.minBotPlayers
   */
  minBotPlayers: 10,

  /**
   * Maximum number of bot players allowed in a single game.
   * Mirrors: GameSettings.maxBotPlayers
   */
  maxBotPlayers: 25,

  /**
   * Minimum number of bingo cards a bot player purchases per game.
   * Mirrors: GameSettings.botMinCards
   */
  botMinCards: 1,

  /**
   * Maximum number of bingo cards a bot player can purchase per game.
   * Mirrors: GameSettings.botMaxCards
   */
  botMaxCards: 3,

  /**
   * Whether bot players are visually labelled as "Bot" in the UI / lobby.
   * Mirrors: GameSettings.showBotLabels
   */
  showBotLabels: true,

  /**
   * Minimum delay (milliseconds) before a bot joins a game after it opens.
   * Introduces randomness to make bots appear more human-like.
   * Mirrors: GameSettings.botJoinDelayMin
   */
  botJoinDelayMin: 500,

  /**
   * Maximum delay (milliseconds) before a bot joins a game.
   * Mirrors: GameSettings.botJoinDelayMax
   */
  botJoinDelayMax: 5000,
};

module.exports = botConfig;
