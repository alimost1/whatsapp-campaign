/**
 * Anti-spam delay logic for WhatsApp bulk sending.
 *
 * Rules:
 *   - sentSoFar starts at 0, increment BEFORE computing the next delay
 *   - If sentSoFar >= 500: long 5–10 min delay (daily limit)
 *   - Every 50 messages: long pause 2–5 min
 *   - Every 20 messages: short pause 30–60 s
 *   - Otherwise: base delay 10–20 s
 */

const DAILY_LIMIT = 500;

const BASE_MIN    = 10000;   // 10 s
const BASE_MAX    = 20000;   // 20 s

const SHORT_AFTER     = 20;
const SHORT_PAUSE_MIN = 30000;  // 30 s
const SHORT_PAUSE_MAX = 60000;  // 60 s

const LONG_AFTER     = 50;
const LONG_PAUSE_MIN = 120000;  // 2 min
const LONG_PAUSE_MAX = 300000;  // 5 min

const DAILY_PAUSE_MIN = 300000; // 5 min
const DAILY_PAUSE_MAX = 600000; // 10 min

/**
 * Compute delay in ms before next message.
 * @param {number} sentSoFar   - Messages already sent in this session (increment before calling)
 * @param {number} failedInSession - Failed messages in this session (unused but part of signature)
 * @returns {{ delay: number, reason: string }}
 */
export function computeDelay(sentSoFar, failedInSession) {
  // Daily limit reached —强制长时间暂停
  if (sentSoFar >= DAILY_LIMIT) {
    const delay = DAILY_PAUSE_MIN + Math.random() * (DAILY_PAUSE_MAX - DAILY_PAUSE_MIN);
    return { delay, reason: 'daily_limit' };
  }

  // Long pause every 50 messages
  if (sentSoFar > 0 && sentSoFar % LONG_AFTER === 0) {
    const delay = LONG_PAUSE_MIN + Math.random() * (LONG_PAUSE_MAX - LONG_PAUSE_MIN);
    return { delay, reason: 'long_pause' };
  }

  // Short pause every 20 messages
  if (sentSoFar > 0 && sentSoFar % SHORT_AFTER === 0) {
    const delay = SHORT_PAUSE_MIN + Math.random() * (SHORT_PAUSE_MAX - SHORT_PAUSE_MIN);
    return { delay, reason: 'short_pause' };
  }

  // Base random delay
  const delay = BASE_MIN + Math.random() * (BASE_MAX - BASE_MIN);
  return { delay, reason: 'normal' };
}

/**
 * Format milliseconds as a human-readable string.
 * @param {number} ms
 * @returns {string} e.g. "15s" or "2.5min"
 */
export function formatDelay(ms) {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}min`;
  }
  return `${(ms / 1000).toFixed(0)}s`;
}