/**
 * WhatsApp assistant — receives incoming messages via Evolution webhook
 * and replies with chat responses from v2Chat (Promo Immo Marrakech data).
 *
 * Flow:
 *   1. webhook receives messages.upsert
 *   2. v2Attribution matches it to a campaign (if any) for A/B tracking
 *   3. if no campaign match OR no recent A/B context → forward to assistant
 *   4. assistant calls v2Chat with the user's message
 *   5. truncate response to WhatsApp-friendly chunks (4096 char limit)
 *   6. send reply back via Evolution sendText/{instanceName}
 *
 * Anti-spam:
 *   - Ignore group messages (@g.us)
 *   - Ignore status broadcasts (@broadcast)
 *   - Ignore self-echoes (fromMe=true, already filtered)
 *   - Throttle: max 1 reply per phone per 5 seconds
 *   - Skip if same messageId was already replied to (idempotent)
 */
import axios from 'axios';
import { chat as chatAssistant } from './v2Chat.js';

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8082';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';

// Per-phone rate limit (5-second cooldown)
const lastReplyAt = new Map();
const COOLDOWN_MS = 5000;
// Idempotency: track messageIds we've already replied to (LRU-ish)
const repliedIds = new Set();
const MAX_REPLIED_IDS = 1000;

const WHATSAPP_TEXT_LIMIT = 4096;

function isGroupMessage(payload) {
  const jid = payload?.data?.key?.remoteJid || '';
  return jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter');
}

function isAlreadyReplied(messageId) {
  if (!messageId) return false;
  if (repliedIds.has(messageId)) return true;
  // Evict if at capacity (FIFO)
  if (repliedIds.size >= MAX_REPLIED_IDS) {
    const first = repliedIds.values().next().value;
    repliedIds.delete(first);
  }
  repliedIds.add(messageId);
  return false;
}

function withinCooldown(phone) {
  const last = lastReplyAt.get(phone) || 0;
  if (Date.now() - last < COOLDOWN_MS) return true;
  lastReplyAt.set(phone, Date.now());
  return false;
}

/**
 * Format the chat assistant response for WhatsApp:
 *   - Strip **markdown** (WhatsApp uses *bold* not **bold**)
 *   - Convert [text](url) → "text: url"
 *   - Truncate long property card lists (max 5 inline)
 *   - Convert property cards to a numbered list
 *   - Cap total length at 4096 chars
 */
function formatForWhatsApp(chatResult) {
  let text = (chatResult.text || '')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')         // **bold** → *bold*
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2'); // [text](url) → text: url

  // Property cards → numbered list (limit to 5 to fit in 4k)
  const cards = (chatResult.cards || []).slice(0, 5);
  if (cards.length) {
    text += '\n\n';
    cards.forEach((c, i) => {
      const parts = [`${i + 1}. ${c.title || 'Bien'}`];
      if (c.surface) parts.push(`${c.surface} m²`);
      if (c.bedrooms) parts.push(`${c.bedrooms} ch`);
      if (c.price) parts.push(c.price);
      parts.push(`🔗 ${c.url}`);
      text += parts.join(' — ') + '\n';
    });
    if (chatResult.cards.length > 5) {
      text += `\n_…et ${chatResult.cards.length - 5} autres. Précisez votre recherche (ex: "villa 5 chambres")._`;
    }
  }

  // Cap at WhatsApp limit, with ellipsis if needed
  if (text.length > WHATSAPP_TEXT_LIMIT) {
    text = text.slice(0, WHATSAPP_TEXT_LIMIT - 50) + '\n\n_…message tronqué, précisez votre demande._';
  }
  return text;
}

/**
 * Send a WhatsApp text reply via Evolution API.
 */
async function sendWhatsAppReply({ instanceName, phone, text }) {
  const url = `${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`;
  try {
    const r = await axios.post(
      url,
      { number: phone, text, delay: 600 },
      { headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true }
    );
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, id: r.data?.key?.id };
    }
    return { ok: false, error: `Evolution ${r.status}: ${JSON.stringify(r.data)}` };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Handle an incoming WhatsApp message: reply via assistant (if appropriate).
 * Called from the webhook handler after A/B attribution runs.
 *
 * Returns { replied: bool, reason?: string }.
 */
export async function handleWhatsAppMessage(payload) {
  // Skip non-direct (group, broadcast, newsletter)
  if (isGroupMessage(payload)) return { replied: false, reason: 'group-or-broadcast' };

  const instanceName = payload.instance;
  const phone = phoneFromEvent(payload);
  const text = extractText(payload);
  const messageId = payload?.data?.key?.id || null;
  const pushName = payload?.data?.pushName || null;

  if (!phone) return { replied: false, reason: 'no-phone' };
  if (!text || !text.trim()) return { replied: false, reason: 'empty-text' };
  if (isAlreadyReplied(messageId)) return { replied: false, reason: 'duplicate' };
  if (withinCooldown(phone)) return { replied: false, reason: 'cooldown' };

  // Greeting-only messages (just "hi", "bonjour") → still reply with welcome
  // Otherwise call assistant
  let chatResult;
  try {
    chatResult = await chatAssistant(text);
  } catch (e) {
    console.error('[whatsapp-assistant] chat error:', e.message);
    return { replied: false, reason: 'chat-error' };
  }

  // Don't reply to "help" or pure informational responses if user said something
  // generic — but DO reply if there's any text/cards to share
  if (!chatResult.text && (!chatResult.cards || chatResult.cards.length === 0)) {
    return { replied: false, reason: 'no-content' };
  }

  const replyText = formatForWhatsApp(chatResult);

  const sent = await sendWhatsAppReply({ instanceName, phone, text: replyText });
  if (!sent.ok) {
    console.error(`[whatsapp-assistant] send failed:`, sent.error);
    return { replied: false, reason: 'send-failed', error: sent.error };
  }

  console.log(
    `[whatsapp-assistant] replied to ${phone} (${pushName || 'unknown'}) on ${instanceName}, msgId=${sent.id}, intent=${chatResult.intent}`
  );
  return { replied: true, messageId: sent.id, intent: chatResult.intent };
}

function phoneFromEvent(payload) {
  const k = payload?.data?.key;
  if (!k || k.fromMe) return null;
  let jid = k.remoteJid || '';
  if (!jid) return null;
  jid = jid.split('@')[0].split(':')[0];
  return jid || null;
}

function extractText(payload) {
  return (
    payload?.data?.message?.conversation ||
    payload?.data?.message?.extendedTextMessage?.text ||
    payload?.data?.message?.imageMessage?.caption ||
    payload?.data?.message?.videoMessage?.caption ||
    ''
  );
}
