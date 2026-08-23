/**
 * v2 dispatcher — scans campaigns.jsonl for scheduled campaigns whose
 * scheduledAt is due, then sends them via the chosen channel.
 */
import fs from 'fs';
import crypto from 'crypto';
import { send } from './channels.js';
import { computeDelay } from './antiSpam.js';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { toWhatsAppNumber } from '../utils/phone.js';

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

function pickVariant(message, contactPhone, campaignId) {
  if (message && Array.isArray(message.variants)) {
    const seed = crypto.createHash('sha256').update(`${campaignId}:${contactPhone}`).digest();
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
  fs.writeFileSync(CAMPAIGNS_FILE, all.map((c) => JSON.stringify(c)).join('\n') + '\n');
}

export async function dispatchCampaign(campaignId) {
  const c = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id).find((x) => x.id === campaignId);
  if (!c) throw new Error(`Campaign ${campaignId} not found`);
  if (c.status === 'sent' || c.status === 'sending') return { skipped: 'already ' + c.status };

  // UI-created campaigns must always resolve current contacts. Only an
  // explicitly marked manual target list is allowed to bypass the stores.
  const contacts = c.manualTargets === true && Array.isArray(c.contacts)
    ? normalizeAndDedupe(c.contacts)
    : filterContactsByTags(c);

  console.log(`[v2-dispatcher] campaign ${c.id} resolved ${contacts.length} targets:`, contacts.map((x) => x.phone));

  if (!contacts.length) {
    c.status = 'failed';
    c.error = 'no contacts resolved';
    persistCampaign(c);
    return { skipped: 'no contacts' };
  }

  c.status = 'sending';
  c.startedAt = new Date().toISOString();
  c.sentLog = [];
  c.targetCount = contacts.length;
  persistCampaign(c);

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const phone = contact.phone;
    const { text, variant } = pickVariant(c.message, phone, c.id);
    let attempt = 0;
    let lastError = null;

    while (attempt < 2) {
      try {
        await send({ channel: c.channel, instanceName: c.instanceName, number: phone, text });
        c.sentLog.push({ phone, variant, status: 'sent', at: new Date().toISOString() });
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
      c.sentLog.push({ phone, variant, status: 'failed', error: lastError.slice(0, 200), at: new Date().toISOString() });
      failed++;
    }
    persistCampaign(c);

    const { delay } = computeDelay(sent, failed);
    await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));
  }

  c.status = failed === contacts.length ? 'failed' : 'sent';
  c.completedAt = new Date().toISOString();
  c.summary = { sent, failed, total: contacts.length };
  persistCampaign(c);
  return { sent, failed, total: contacts.length };
}

function normalizeAndDedupe(contacts) {
  const seen = new Set();
  return contacts.map((contact) => {
    const phone = toWhatsAppNumber(contact.phone || contact);
    return { ...(typeof contact === 'object' ? contact : {}), phone };
  }).filter((contact) => {
    if (!contact.phone || contact.phone.length < 10 || seen.has(contact.phone)) return false;
    seen.add(contact.phone);
    return true;
  });
}

function filterContactsByTags(campaign) {
  const contactsFile = path.join(DATA_DIR, 'contacts.jsonl');
  const jsonlContacts = readJsonl(contactsFile).filter((d) => d.phone);
  let sqlContacts = [];

  try {
    sqlContacts = db.prepare(
      'SELECT name, phone, group_name FROM contacts WHERE phone IS NOT NULL'
    ).all().map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      tags: contact.group_name ? [contact.group_name] : [],
      source: 'sqlite',
    }));
  } catch (e) {
    console.error('[v2-dispatcher] failed to read SQLite contacts:', e.message);
  }

  const all = normalizeAndDedupe([...jsonlContacts, ...sqlContacts]);
  const tags = campaign.targetTags || [];
  if (!tags.length) return all;

  return all.filter((contact) => {
    const contactTags = contact.tags || [];
    if (campaign.targetTagMode === 'AND') return tags.every((tag) => contactTags.includes(tag));
    return tags.some((tag) => contactTags.includes(tag));
  });
}

export async function tick() {
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const now = new Date();
  for (const c of all) {
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
