/**
 * i18n utility — loads Amharic (default) or English strings
 * and replaces {{placeholder}} tokens with provided values.
 */

const am = require('../i18n/am.json');
const en = require('../i18n/en.json');

const locales = { am, en };

/**
 * Translate a key for a given language.
 * @param {string} key       - Message key (e.g. 'welcome')
 * @param {string} [lang]    - 'am' | 'en' (default: 'am')
 * @param {object} [params]  - Token replacements e.g. { name: 'John' }
 * @returns {string}
 */
function t(key, lang = 'am', params = {}) {
  const locale = locales[lang] || locales['am'];
  let message = locale[key] || am[key] || key;

  // Replace {{token}} placeholders
  Object.entries(params).forEach(([token, value]) => {
    message = message.replace(new RegExp(`{{${token}}}`, 'g'), value);
  });

  return message;
}

module.exports = { t };
