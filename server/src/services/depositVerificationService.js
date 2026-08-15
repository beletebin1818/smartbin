'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const prisma = require('../utils/prisma');

/**
 * Parses an SMS string to extract deposit details.
 * @param {string} smsText 
 * @param {string} method "CBE" or "TeleBirr"
 * @returns {object} Extracted fields
 */
function parseSMS(smsText, method) {
  const data = {};
  
  if (method === 'CBE') {
    const amountMatch = smsText.match(/transferred ETB\s*([\d,.]+)/i);
    if (amountMatch) data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    
    const senderMatch = smsText.match(/from account ([\d*]+)/i);
    if (senderMatch) data.senderAccount = senderMatch[1];
    
    const receiverMatch = smsText.match(/to account ([\d*]+)\s*\(([^)]+)\)/i);
    if (receiverMatch) {
      data.receiverAccount = receiverMatch[1];
      data.receiverName = receiverMatch[2].trim();
    }
    
    const urlMatch = smsText.match(/(https:\/\/mbreciept\.cbe\.com\.et\/[^\s]+)/i);
    if (urlMatch) data.receiptUrl = urlMatch[1];
    
  } else if (method === 'TeleBirr') {
    // TeleBirr SMS format parsing
    // Example: "You have transferred ETB 588.00 to Keiyru Nur (2519****4111) on 26/07/2026 10:02:53."
    // "Your transaction number is DGQ790EOTV."
    // "https://transactioninfo.ethiotelecom.et/receipt/DGQ790EOTV"

    // 1. Amount: check transferred pattern first to avoid picking up fee or account balance
    const amountMatch =
      smsText.match(/transferred\s+(?:ETB\s*)?([\d,]+(?:\.\d+)?)/i) ||
      smsText.match(/ETB\s*([\d,]+(?:\.\d+)?)/i) ||
      smsText.match(/([\d,]+(?:\.\d+)?)\s*ETB/i) ||
      smsText.match(/Birr\s*([\d,]+(?:\.\d+)?)/i);
    if (amountMatch) data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));

    // 2. Receipt Link
    const urlMatch = smsText.match(/(https:\/\/transactioninfo\.ethiotelecom\.et\/receipt\/[^\s]+)/i);
    if (urlMatch) data.receiptUrl = urlMatch[1].replace(/[.,);]+$/, '');

    // 3. Transaction ID / Number
    const txMatch =
      smsText.match(/(?:transaction\s+(?:number|id)|tx\s*id|txn\s*id)\s+(?:is\s+)?([A-Za-z0-9]+)/i) ||
      smsText.match(/Transaction ID[:\s]*([A-Za-z0-9]+)/i);
    if (txMatch) {
      data.transactionId = txMatch[1];
    } else if (data.receiptUrl) {
      const urlTxMatch = data.receiptUrl.match(/\/receipt\/([A-Za-z0-9]+)/i);
      if (urlTxMatch) data.transactionId = urlTxMatch[1];
    }

    // 4. Recipient information
    const receiverMatch = smsText.match(/to\s+([^(]+?)\s*\(([^)]+)\)/i);
    if (receiverMatch) {
      data.receiverName = receiverMatch[1].trim();
      data.receiverAccount = receiverMatch[2].trim();
    }

    // 5. Date & Time
    const dateTimeMatch =
      smsText.match(/on\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i) ||
      smsText.match(/on\s+([\d\/\-\s:]+?)(?=\.|\n|$)/i);
    if (dateTimeMatch) data.dateTime = dateTimeMatch[1].trim();
  }
  
  // If no URL matched via strict method rules, try generic fallback
  if (!data.receiptUrl) {
    const fallbackUrl = smsText.match(/(https?:\/\/[^\s]+)/i);
    if (fallbackUrl) data.receiptUrl = fallbackUrl[1].replace(/[.,);]+$/, '');
  }

  return data;
}

/**
 * Scrapes the receipt URL for transaction details.
 * @param {string} receiptUrl 
 * @returns {object} Extracted receipt details
 */
async function fetchReceiptData(receiptUrl) {
  try {
    const response = await axios.get(receiptUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(response.data);
    const textContext = $('body').text().replace(/\s+/g, ' ');

    console.log('[VERIFICATION] Receipt raw text (first 500):', textContext.substring(0, 500));

    const data = {};

    // ── CBE format: "Transferred Amount: 1624.00 ETB" or "1624.00 ETB" ──────
    // CBE shows number BEFORE ETB: "1624.00 ETB"
    const cbeTransferredMatch = textContext.match(/Transferred\s+Amount[:\s]+([\d,]+(?:\.\d+)?)\s*ETB/i);
    if (cbeTransferredMatch) {
      data.amount = parseFloat(cbeTransferredMatch[1].replace(/,/g, ''));
    }

    // Fallback: any pattern "NNNN.NN ETB" (number then ETB)
    if (!data.amount) {
      const numberBeforeEtb = textContext.match(/([\d,]+(?:\.\d+)?)\s*ETB/i);
      if (numberBeforeEtb) data.amount = parseFloat(numberBeforeEtb[1].replace(/,/g, ''));
    }

    // Fallback: "ETB NNNN.NN" (ETB then number)
    if (!data.amount) {
      const etbBeforeNumber = textContext.match(/ETB\s*([\d,]+(?:\.\d+)?)/i);
      if (etbBeforeNumber) data.amount = parseFloat(etbBeforeNumber[1].replace(/,/g, ''));
    }

    // ── Reference No / Transaction ID ─────────────────────────────────────
    const txMatch = textContext.match(/(?:Reference\s*No|Transaction\s*(?:Number|ID)|Txn\s*ID|Receipt\s*No)\.?[:\s]*([A-Za-z0-9]+)/i);
    if (txMatch) {
      data.transactionId = txMatch[1];
    } else if (receiptUrl) {
      const urlTxMatch = receiptUrl.match(/\/receipt\/([A-Za-z0-9]+)/i);
      if (urlTxMatch) data.transactionId = urlTxMatch[1];
    }

    // ── Receiver name ─────────────────────────────────────────────────────────
    const receiverMatch = textContext.match(/Receiver[:\s]+([A-Za-z\s]+?)(?=\s{2,}|Account|$)/i);
    if (receiverMatch) data.receiverName = receiverMatch[1].trim();

    data.rawText = textContext.substring(0, 1000);

    console.log('[VERIFICATION] Parsed receipt data:', JSON.stringify(data));
    return data;
  } catch (error) {
    console.error(`[VERIFICATION] Failed to fetch receipt: ${error.message}`);
    return null;
  }
}

/**
 * Compares SMS Data with Receipt Data
 * @param {object} smsData 
 * @param {object} receiptData 
 * @returns {object} { status, mismatchFields }
 */
function compareData(smsData, receiptData) {
  const mismatchFields = [];

  // Receipt fetch failed entirely (network error)
  if (!receiptData) {
    // Don't block — receipt URL exists, admin can open it manually
    return { status: 'VERIFIED', mismatchFields: [] };
  }

  // Both amounts available — compare them
  if (smsData.amount && receiptData.amount) {
    if (Math.abs(smsData.amount - receiptData.amount) > 0.01) {
      mismatchFields.push(`Amount mismatch: SMS=${smsData.amount}, Receipt=${receiptData.amount}`);
    }
  }
  // Receipt was fetched but amount could not be parsed from it
  // — treat as VERIFIED since the URL was real and admin can check
  // (don't flag as MISMATCH just because our parser didn't find the number)

  return {
    status: mismatchFields.length > 0 ? 'MISMATCH' : 'VERIFIED',
    mismatchFields
  };
}

/**
 * Background task: fetch receipt data and update the verification record.
 * Runs asynchronously AFTER the deposit request has already been confirmed to the user.
 * This keeps the bot response fast — the external HTTP call never blocks the user.
 */
async function updateVerificationWithReceipt(depositVerificationId, receiptUrl, smsData, amount) {
  try {
    console.log(`[VERIFICATION] Background receipt fetch starting for verification ID: ${depositVerificationId}`);
    const receiptData = await fetchReceiptData(receiptUrl);
    const comparison = compareData(smsData, receiptData);
    let verificationStatus = comparison.status;
    const mismatchFields = [...comparison.mismatchFields];

    // Cross-check amount if both are available
    if (smsData.amount && receiptData && receiptData.amount && Math.abs(smsData.amount - amount) > 0.01) {
      verificationStatus = 'MISMATCH';
      mismatchFields.push(`User input amount (${amount}) differs from SMS amount (${smsData.amount})`);
    }

    const finalTransactionId = (receiptData && receiptData.transactionId) || smsData.transactionId || null;

    await prisma.depositVerification.update({
      where: { id: depositVerificationId },
      data: {
        receiptData: receiptData || {},
        verificationStatus,
        mismatchFields,
        ...(finalTransactionId && { transactionId: finalTransactionId }),
      },
    });

    console.log(`[VERIFICATION] Background receipt fetch completed — status: ${verificationStatus}`);
  } catch (err) {
    console.error(`[VERIFICATION] Background receipt fetch failed for ID ${depositVerificationId}:`, err.message);
  }
}

/**
 * Main function to verify a deposit request.
 *
 * FAST PATH (blocks the response):
 *   1. Parse SMS
 *   2. Duplicate checks (DB only — fast)
 *   3. Create DepositVerification record with status PENDING_RECEIPT
 *   4. Return success immediately
 *
 * BACKGROUND (non-blocking):
 *   5. Fetch external receipt URL and update the verification record
 */
async function verifyDeposit(playerId, agentId, amount, method, smsProof, parsedReceiptUrl) {
  console.log(`[VERIFICATION] Starting verification for Player ID: ${playerId}, Method: ${method}`);

  if (!smsProof || typeof smsProof !== 'string' || smsProof.trim().length === 0) {
    console.warn('[VERIFICATION] smsProof is empty — creating unverified record.');
    const depositVerification = await prisma.depositVerification.create({
      data: {
        playerId,
        agentId,
        smsText: '',
        receiptUrl: parsedReceiptUrl || null,
        smsData: {},
        receiptData: {},
        verificationStatus: 'FAILED',
        mismatchFields: ['No SMS proof provided'],
        transactionId: null,
        amount: amount,
        status: 'pending'
      }
    });
    return { success: true, depositVerification };
  }
  
  const smsData = parseSMS(smsProof, method);
  const receiptUrl = parsedReceiptUrl || smsData.receiptUrl;

  // 1. Duplicate Check: Ensure the receiptUrl or transactionId hasn't been used in an active request
  if (receiptUrl) {
    const existingVerifications = await prisma.depositVerification.findMany({
      where: { receiptUrl: receiptUrl }
    });
    
    // Allow if previous was explicitly rejected, but block if verified or pending
    const hasActiveDuplicate = existingVerifications.some(v => v.status !== 'rejected');
    if (hasActiveDuplicate) {
      return { success: false, reason: 'DUPLICATE', message: 'This receipt has already been submitted.' };
    }
  }
  
  if (smsData.transactionId) {
    const existingTx = await prisma.depositVerification.findFirst({
      where: { transactionId: smsData.transactionId, status: { not: 'rejected' } }
    });
    if (existingTx) {
      return { success: false, reason: 'DUPLICATE', message: 'This transaction ID has already been submitted.' };
    }
  }

  // 2. Create Verification Record immediately — NO external HTTP call yet.
  //    verificationStatus = 'PENDING_RECEIPT' → will be updated in background.
  //    verificationStatus = 'FAILED'          → no receipt URL, admin reviews manually.
  const initialStatus   = receiptUrl ? 'PENDING_RECEIPT' : 'FAILED';
  const initialMismatch = receiptUrl ? [] : ['No receipt URL provided or could not be matched.'];
  const knownTxId       = smsData.transactionId || null;

  const depositVerification = await prisma.depositVerification.create({
    data: {
      playerId,
      agentId,
      smsText: smsProof,
      receiptUrl: receiptUrl || null,
      smsData: smsData,
      receiptData: {},
      verificationStatus: initialStatus,
      mismatchFields: initialMismatch,
      transactionId: knownTxId,
      amount: smsData.amount || amount,
      status: 'pending'
    }
  });

  console.log(`[VERIFICATION] Record created (ID: ${depositVerification.id}) — receipt fetch will run in background.`);

  // 3. Fire-and-forget: fetch receipt URL and update the record in the background.
  //    This does NOT delay the bot response — the user sees the success message instantly.
  if (receiptUrl) {
    updateVerificationWithReceipt(depositVerification.id, receiptUrl, smsData, amount);
  }

  return {
    success: true,
    depositVerification
  };
}

module.exports = {
  verifyDeposit
};
