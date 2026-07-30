/**
 * v2 dispatcher — scans campaigns.jsonl for scheduled campaigns whose
 * scheduledAt is due, then sends them via the chosen channel.
 *
 * - One campaign at a time (anti-ban friendly; matches v1 worker policy).
 * - Splits A/B variants deterministically using a stable hash of contact
 *   phone + campaign id so groups are reproducible.
 * - Throttles ~1 msg/sec across the batch.
 * - Retries each contact once on failure, then marks failed.
 * - Persists every result back to campaigns.jsonl on each step.
 */
import fs from 'fs';
import crypto from 'crypto';
import { send } from './channels.js';
import { computeDelay } from './antiSpam.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.jsonl');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
function writeJsonl(file, arr) {
  const body = arr.map((x) => JSON.stringify(x)).join('\n') + '\n';
  fs.writeFileSync(file, body);
}
function pickVariant(message, contactPhone, campaignId) {
  if (message && Array.isArray(message.variants)) {
    const seed = crypto
      .createHash('sha256')
      .update(`${campaignId}:${contactPhone}`)
      .digest();
    const idx = seed.readUInt32BE(0) % message.variants.length;
    return { text: message.variants[idx], variant: String.fromCharCode(65 + idx) };
  }
  return { text: String(message || ''), variant: 'A' };
}

function persistCampaign(updated) {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const idx = all.findIndex((c) => c.id === updated.id);
  if (idx === -1) return;
  all[idx] = updated;
  const body = all.map((c) => JSON.stringify(c)).join('\n') + '\n';
  fs.writeFileSync(CAMPAIGNS_FILE, body);
}

export async function dispatchCampaign(campaignId) {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  console.log(`[v2-dispatcher] dispatchCampaign(${campaignId}): found ${all.length} campaigns in file:`, all.map((c) => c.id));
  const c = all.find((x) => x.id === campaignId);
  if (!c) throw new Error(`Campaign ${campaignId} not found`);
  if (c.status === 'sent' || c.status === 'sending') return { skipped: 'already ' + c.status };

  // Resolve target contacts (either explicit or tag-filtered)
  let contacts = c.contacts;
  if (!contacts || contacts.length === 0) {
    contacts = filterContactsByTags(c);
  }
  if (!contacts.length) {
    c.status = 'failed';
    c.error = 'no contacts resolved';
    persistCampaign(c);
    return { skipped: 'no contacts' };
  }

  c.status = 'sending';
  c.startedAt = new Date().toISOString();
  c.sentLog = c.sentLog || [];
  persistCampaign(c);

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const phone = contact.phone || contact;
    const { text, variant } = pickVariant(c.message, phone, c.id);

    let attempt = 0;
    let lastError = null;
    while (attempt < 2) {
      try {
        await send({
          channel: c.channel,
          instanceName: c.instanceName,
          number: phone,
          text,
        });
        c.sentLog.push({
          phone, variant, status: 'sent', at: new Date().toISOString(),
        });
        sent++;
        lastError = null;
        break;
      } catch (e) {
        lastError = e.message || String(e);
        attempt++;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (lastError) {
      c.sentLog.push({
        phone, variant, status: 'failed', error: lastError.slice(0, 200),
        at: new Date().toISOString(),
      });
      failed++;
    }
    persistCampaign(c);

    // Throttle ~1 msg/sec between contacts
    const { delay } = computeDelay(sent, failed);
    await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));
  }

  c.status = failed === contacts.length ? 'failed' : 'sent';
  c.completedAt = new Date().toISOString();
  c.summary = { sent, failed, total: contacts.length };
  persistCampaign(c);

  return { sent, failed, total: contacts.length };
}

function filterContactsByTags(campaign) {
  const contactsFile = path.join(DATA_DIR, 'contacts.jsonl');
  const all = readJsonl(contactsFile).filter((d) => d.phone);
  const tags = campaign.targetTags || [];
  if (!tags.length) return all;
  return all.filter((contact) => {
    const t = contact.tags || [];
    if (campaign.targetTagMode === 'AND') return tags.every((tag) => t.includes(tag));
    return tags.some((tag) => t.includes(tag));
  });
}

/**
 * Tick — called by the cron scheduler every minute.
 * Dispatches any scheduled campaign whose scheduledAt has passed and is still pending.
 */
export async function tick() {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const now = new Date();
  for (const c of all) {
    // pending = awaiting scheduled fire; queued = awaiting immediate send-now
    if (c.status !== 'pending' && c.status !== 'queued') continue;
    if (c.status === 'pending' && (!c.scheduledAt || new Date(c.scheduledAt) > now)) continue;
    console.log(`[v2-dispatcher] firing campaign ${c.id} (${c.name})`);
    try {
      await dispatchCampaign(c.id);
    } catch (e) {
      console.error(`[v2-dispatcher] campaign ${c.id} failed:`, e.message);
    }
  }
}
