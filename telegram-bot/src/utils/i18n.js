/**
 * Translation helper module.
 * Reuses the existing JSON i18n files from the backend to ensure language consistency
 * between the Telegram Bot messages and the web app components.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const amPath = path.resolve(__dirname, '../../server/src/i18n/am.json');
const enPath = path.resolve(__dirname, '../../server/src/i18n/en.json');

let am = {};
let en = {};

try {
  am = JSON.parse(fs.readFileSync(amPath, 'utf8'));
} catch (err) {
  console.error(`⚠️ Failed to load Amharic translations from ${amPath}:`, err.message);
}

try {
  en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
} catch (err) {
  console.error(`⚠️ Failed to load English translations from ${enPath}:`, err.message);
}

const translations = { am, en };

/**
 * Translate a key into the chosen language.
 *
 * @param {string} key - translation dict key
 * @param {string} [lang='am'] - 'am' or 'en'
 * @param {object} [replacements={}] - object containing template variables replacements
 * @returns {string} translation string
 */
function t(key, lang = 'am', replacements = {}) {
  const targetLang = ['am', 'en'].includes(lang) ? lang : 'am';
  const dict = translations[targetLang];
  let text = dict[key] || translations['am'][key] || key;

  // Replace double brace placeholders (e.g. {{amount}} or {{balance}})
  Object.keys(replacements).forEach((k) => {
    text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), replacements[k]);
  });

  return text;
}

module.exports = { t };
