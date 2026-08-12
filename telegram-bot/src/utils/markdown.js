/**
 * MarkdownV2 escaping utilities for Telegraf
 */

'use strict';

/**
 * Escapes characters for Telegram's MarkdownV2.
 * If keepFormatting is true, it preserves *, `, and > at the beginning of lines.
 *
 * @param {string} text - text to escape
 * @param {boolean} [keepFormatting=false] - whether to preserve markdown formatting tokens
 * @returns {string} escaped text
 */
function escapeMarkdownV2(text, keepFormatting = false) {
  if (text === null || text === undefined) return '';
  const str = String(text);

  if (!keepFormatting) {
    return str.replace(/\\(.)|([_*[\]()~`>#+\-=|{}.!])/g, (match, escapedChar, specialChar) => {
      if (escapedChar) return match;
      return '\\' + specialChar;
    });
  }

  // Preserve valid markdown links [text](url)
  const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links = [];
  const withLinkTokens = str.replace(LINK_REGEX, (match, linkText, linkUrl) => {
    const id = `__MD_LINK_${links.length}__`;
    links.push({ linkText, linkUrl });
    return id;
  });

  let escaped = withLinkTokens.replace(/\\(.)|([_*[\]()~`>#+\-=|{}.!])/g, (match, escapedChar, specialChar, offset) => {
    if (escapedChar) {
      return match; // Keep already-escaped character
    }

    if (
      specialChar === '*' ||
      specialChar === '_' ||
      specialChar === '`' ||
      specialChar === '~'
    ) {
      return specialChar; // Keep bold, italic, code, strikethrough
    }

    if (specialChar === '>') {
      // Keep blockquote indicator only if it is at the start of a line
      if (offset === 0 || withLinkTokens[offset - 1] === '\n') {
        return specialChar;
      }
    }

    return '\\' + specialChar; // Escape all other special characters (including (, ), [, ])
  });

  // Restore links
  links.forEach(({ linkText, linkUrl }, index) => {
    const id = `__MD_LINK_${index}__`;
    const escapedLinkText = escapeMarkdownV2(linkText, true);
    const escapedLinkUrl = linkUrl.replace(/\\(.)|([)\\])/g, (m, e, s) => e ? m : '\\' + s);
    escaped = escaped.replace(id, `[${escapedLinkText}](${escapedLinkUrl})`);
  });

  return escaped;
}

module.exports = {
  escapeMarkdownV2,
};
