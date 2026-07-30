/**
 * Reply attribution — matches incoming WhatsApp messages (received via
 * Evolution webhook) back to the campaign + variant that delivered them.
 *
 * Algorithm:
 *  1. On incoming message: phone → most recent campaign that sent to it
 *     (within a 14-day attribution window) on the same instance.
 *  2. Find that campaign's sentLog entry for that phone → variant assigned.
 *  3. Append to campaign.replies[] and increment campaign.repliesByVariant[v].
 *  4. Persist back to JSONL.
 *
 * Notes:
 *  - "Reply" is any inbound message (not fromMe) — first inbound wins,
 *    subsequent messages still attributed to the same variant for the
 *    same campaign. We're tracking response rate, not conversation depth.
 *  - Attribution window is 14 days (configurable) — older sends won't claim
 *    the reply.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.jsonl');

const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
function writeJsonl(file, arr) {
  const body = arr.map((x) => JSON.stringify(x)).join('\n') + '\n';
  fs.writeFileSync(file, body);
}

/**
 * Extract the phone number from an Evolution messages.upsert payload.
 * Strips @s.whatsapp.net suffix and device-id digits.
 */
export function phoneFromWebhook(payload) {
  const k = payload?.data?.key;
  if (!k || k.fromMe) return null;
  let jid = k.remoteJid || '';
  if (!jid) return null;
  jid = jid.split('@')[0];
  // Strip device id (anything after ":" — e.g. "212641390881:13")
  jid = jid.split(':')[0];
  return jid || null;
}

/**
 * Find the most recent campaign that sent to (phone, instanceName).
 * Returns null if none within window.
 */
export function findCampaignForReply({ phone, instanceName }) {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const now = Date.now();
  // Iterate newest first — assumes JSONL is roughly append-ordered.
  // We sort by startedAt desc for correctness.
  const sorted = all
    .filter((c) => c.instanceName === instanceName && c.status === 'sent' && c.startedAt)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  for (const c of sorted) {
    if (now - new Date(c.startedAt).getTime() > ATTRIBUTION_WINDOW_MS) break;
    const hit = (c.sentLog || []).find(
      (s) => s.phone === phone && s.status === 'sent' && s.variant
    );
    if (hit) return { campaign: c, variant: hit.variant };
  }
  return null;
}

/**
 * Attribute an incoming message to a campaign + variant.
 * Returns { campaignId, variant } if attributed, or null if dropped.
 * Idempotent for the same messageId (won't double-count).
 */
export function attributeReply({ phone, instanceName, messageId, pushName, text }) {
  if (!phone || !instanceName) return null;
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const hit = findCampaignForReply({ phone, instanceName });
  if (!hit) return null;
  const c = all.find((x) => x.id === hit.campaign.id);
  if (!c) return null;

  // Idempotency: if we already recorded a reply with this messageId, skip.
  c.replies = c.replies || [];
  if (messageId && c.replies.some((r) => r.messageId === messageId)) return null;

  c.replies.push({
    phone,
    variant: hit.variant,
    messageId: messageId || null,
    text: (text || '').slice(0, 500),
    pushName: pushName || null,
    at: new Date().toISOString(),
  });
  c.repliesByVariant = c.repliesByVariant || {};
  c.repliesByVariant[hit.variant] = (c.repliesByVariant[hit.variant] || 0) + 1;

  writeJsonl(CAMPAIGNS_FILE, all);
  return { campaignId: c.id, variant: hit.variant };
}

/**
 * Compute response-rate report per variant.
 * Returns { variants: { A: {sent, replies, rate}, B: {...} }, total, window }
 */
export function computeVariantReport(campaignId) {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const c = all.find((x) => x.id === campaignId);
  if (!c) return null;

  const variants = {};
  // Count sends per variant from sentLog
  for (const s of c.sentLog || []) {
    if (s.status !== 'sent') continue;
    const v = s.variant || 'A';
    variants[v] = variants[v] || { sent: 0, replies: 0, rate: 0 };
    variants[v].sent += 1;
  }
  // Add reply counts
  const repliesByVariant = c.repliesByVariant || {};
  for (const v of Object.keys(variants)) {
    variants[v].replies = repliesByVariant[v] || 0;
    variants[v].rate = variants[v].sent
      ? +(variants[v].replies / variants[v].sent).toFixed(4)
      : 0;
  }
  const totalReplies = (c.replies || []).length;
  return {
    campaignId,
    status: c.status,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    totalReplies,
    variants,
    windowDays: ATTRIBUTION_WINDOW_MS / (24 * 60 * 60 * 1000),
    winner: pickWinner(variants),
  };
}

function pickWinner(variants) {
  const valid = Object.entries(variants).filter(([, v]) => v.sent > 0);
  if (valid.length < 2) return null;
  valid.sort((a, b) => b[1].rate - a[1].rate);
  const [best, second] = valid;
  if (best[1].rate === second[1].rate) return null;
  return { variant: best[0], lift: +(best[1].rate - second[1].rate).toFixed(4) };
}
