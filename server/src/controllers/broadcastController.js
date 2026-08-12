/**
 * Broadcast Controller — send messages to all or selected players via Telegram bot
 */

'use strict';

const prisma = require('../utils/prisma');
const { escapeMarkdownV2 } = require('../../../telegram-bot/src/utils/markdown');

/**
 * GET /api/broadcast
 * List recent broadcast records
 */
async function list(req, res, next) {
  try {
    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ success: true, data: broadcasts });
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to dispatch single Telegram message (photo or text) with MarkdownV2 fallback
 */
async function sendSingleTelegramMessage(botToken, telegramId, formattedText, imageUrl) {
  const telegramApi = `https://api.telegram.org/bot${botToken}`;

  try {
    if (imageUrl) {
      if (imageUrl.startsWith('data:image/')) {
        // Base64 Data URL
        const matches = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          const ext = mimeType.split('/')[1] || 'jpg';
          const blob = new Blob([buffer], { type: mimeType });

          // Try with MarkdownV2
          let formData = new FormData();
          formData.append('chat_id', telegramId);
          formData.append('photo', blob, `image.${ext}`);
          formData.append('caption', formattedText);
          formData.append('parse_mode', 'MarkdownV2');

          let resp = await fetch(`${telegramApi}/sendPhoto`, {
            method: 'POST',
            body: formData,
          });
          let result = await resp.json();

          if (!result.ok && result.description && result.description.includes("can't parse entities")) {
            // Retry without MarkdownV2 parse_mode
            const fallbackBlob = new Blob([buffer], { type: mimeType });
            formData = new FormData();
            formData.append('chat_id', telegramId);
            formData.append('photo', fallbackBlob, `image.${ext}`);
            formData.append('caption', formattedText);

            resp = await fetch(`${telegramApi}/sendPhoto`, {
              method: 'POST',
              body: formData,
            });
            result = await resp.json();
          }

          return result.ok;
        }
      }

      // Regular HTTP/HTTPS URL
      let resp = await fetch(`${telegramApi}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          photo: imageUrl,
          caption: formattedText,
          parse_mode: 'MarkdownV2',
        }),
      });
      let result = await resp.json();

      if (!result.ok && result.description && result.description.includes("can't parse entities")) {
        // Retry without MarkdownV2 parse_mode
        resp = await fetch(`${telegramApi}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            photo: imageUrl,
            caption: formattedText,
          }),
        });
        result = await resp.json();
      }

      return result.ok;
    } else {
      // Plain text message
      let resp = await fetch(`${telegramApi}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: formattedText,
          parse_mode: 'MarkdownV2',
        }),
      });
      let result = await resp.json();

      if (!result.ok && result.description && result.description.includes("can't parse entities")) {
        // Retry without MarkdownV2 parse_mode
        resp = await fetch(`${telegramApi}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text: formattedText,
          }),
        });
        result = await resp.json();
      }

      return result.ok;
    }
  } catch (err) {
    console.error(`⚠️ Error sending broadcast message to Telegram ID ${telegramId}:`, err.message);
    return false;
  }
}

/**
 * POST /api/admin/broadcast & POST /api/broadcast/send
 * Body: { mode: "global"|"targeted", playerIds: [...], subject/title, message/body, imageUrl? }
 */
async function send(req, res, next) {
  try {
    const {
      mode = 'global',
      playerIds = [],
      subject,
      title,
      message,
      body,
      imageUrl,
    } = req.body;

    const rawMessage = (message || body || '').trim();
    const subjectTitle = (subject || title || '').trim();

    if (!rawMessage) {
      return res.status(400).json({
        success: false,
        message: 'Message body is required',
      });
    }

    if (mode === 'targeted' && (!Array.isArray(playerIds) || playerIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one player to enable sending',
      });
    }

    // 1. Fetch real players from database
    let players = [];
    if (mode === 'targeted') {
      const numericIds = playerIds
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      players = await prisma.player.findMany({
        where: {
          id: { in: numericIds },
          isBot: false,
        },
        select: { id: true, telegramId: true, firstName: true, phoneNumber: true },
      });
    } else {
      // Global mode: send to all real, verified non-bot players
      players = await prisma.player.findMany({
        where: {
          isBot: false,
        },
        select: { id: true, telegramId: true, firstName: true, phoneNumber: true },
      });
    }

    // 2. Format message text with MarkdownV2
    let fullText = rawMessage;
    if (subjectTitle) {
      fullText = `*${subjectTitle}*\n\n${rawMessage}`;
    }
    const formattedText = escapeMarkdownV2(fullText, true);

    const BOT_TOKEN = process.env.BOT_TOKEN;
    let sentCount = 0;
    let failedCount = 0;

    // 3. Send via Telegram Bot API to each recipient
    if (BOT_TOKEN && players.length > 0) {
      const sendPromises = players.map(async (player) => {
        if (!player.telegramId) {
          failedCount++;
          return;
        }
        const ok = await sendSingleTelegramMessage(BOT_TOKEN, player.telegramId, formattedText, imageUrl);
        if (ok) {
          sentCount++;
        } else {
          failedCount++;
        }
      });

      await Promise.all(sendPromises);
    } else {
      // If dry-run or no players
      if (!BOT_TOKEN) {
        console.warn('⚠️ BOT_TOKEN missing in .env — skipping real Telegram send.');
      }
      failedCount = players.length;
    }

    const adminName = req.user
      ? req.user.username || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
      : 'admin';

    // 4. Log broadcast execution in database for audit trail
    const broadcastRecord = await prisma.broadcast.create({
      data: {
        title: subjectTitle || 'Broadcast',
        body: rawMessage,
        imageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : (imageUrl ? '[image attached]' : null),
        mode,
        targetCount: players.length,
        sentCount,
        failedCount,
        sentBy: adminName,
        status: sentCount > 0 || players.length === 0 ? 'sent' : 'failed',
        sentAt: new Date(),
      },
    });

    const summaryMsg = `Sent to ${sentCount.toLocaleString()} player${sentCount !== 1 ? 's' : ''}${failedCount > 0 ? `, ${failedCount} failed` : ''}`;

    return res.status(200).json({
      success: true,
      message: summaryMsg,
      data: {
        broadcastId: broadcastRecord.id,
        mode,
        targetCount: players.length,
        sentCount,
        failedCount,
        sentBy: adminName,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, send };
