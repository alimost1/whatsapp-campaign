/**
 * v2 dispatcher — scans campaigns in the database for scheduled campaigns whose
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
import { fileTypeFromBuffer } from 'file-type';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.jsonl');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\\n')
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
  fs.writeFileSync(CAMPAIGNS_FILE, all.map((c) => JSON.stringify(c)).join('\\n') + '\\n');
}

export async function dispatchCampaign(campaignId) {
  // Fetch campaign from database
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return { skipped: 'already ' + campaign.status };
  }

  // Resolve contacts (same logic as before)
  let contacts = [];
  if (campaign.manualTargets === true && Array.isArray(campaign.contacts)) {
    contacts = campaign.contacts;
  } else {
    // We don't have the targetTags and targetTagMode in the campaign object from the database? 
    // We need to store them in the campaigns table. We'll assume they are not used for now and fallback to all contacts.
    // For simplicity, we'll get all contacts for the user.
    contacts = db.prepare(`
      SELECT name, phone, group_name
      FROM contacts
      WHERE user_id = ?
    `).all(campaign.userId);
  }

  // Normalize and dedupe phone numbers
  contacts = contacts.map((contact) => ({
    ...contact,
    phone: toWhatsAppNumber(contact.phone || contact)
  })).filter((contact) => {
    if (!contact.phone || contact.phone.length < 10) return false;
    return true;
  });
  // Dedupe by phone
  const seen = new Set();
  contacts = contacts.filter((contact) => {
    if (seen.has(contact.phone)) return false;
    seen.add(contact.phone);
    return true;
  });

  if (!contacts.length) {
    // Update campaign status to failed
    db.prepare(`
      UPDATE campaigns
      SET status = ?, error = ?, completedAt = ?
      WHERE id = ?
    `).run('failed', 'no contacts resolved', new Date().toISOString(), campaignId);
    return { skipped: 'no contacts' };
  }

  // Update campaign to sending
  const startedAt = new Date().toISOString();
  db.prepare(`
    UPDATE campaigns
    SET status = ?, startedAt = ?, sentLog = '[]', targetCount = ?, sentCount = 0, failedCount = 0
    WHERE id = ?
  `).run('sending', startedAt, contacts.length, campaignId);

  let sent = 0;
  let failed = 0;
  const sentLog = [];

  // Get attachments for this campaign
  const attachments = db.prepare(`
    SELECT id, file_path, original_name, mime_type, size
    FROM campaign_attachments
    WHERE campaign_id = ?
    ORDER BY created_at
  `).all(campaignId);

  // Prepare Evolution API credentials
  const evolutionApiKey = process.env.EVOLUTION_API_KEY;
  const evolutionInstanceId = campaign.instanceName || process.env.EVOLUTION_INSTANCE_ID || 'promo';
  const evolutionBaseUrl = process.env.EVOLUTION_URL || 'http://localhost:8082';

  // Function to send media via Evolution API
  const sendMedia = async (phone, mediaType, mimetype, base64Data, fileName, caption) => {
    const url = `${evolutionBaseUrl}/message/sendMedia/${evolutionInstanceId}`;
    const payload = {
      number: phone,
      mediatype: mediaType,
      mimetype,
      media: base64Data,
      fileName,
      caption
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} ${errorText}`);
    }
    return response.json();
  };

  for (const contact of contacts) {
    const phone = contact.phone;
    const { text: messageText, variant } = pickVariant(campaign.message_text, phone, campaignId);

    // Send text message if there is a message
    if (messageText) {
      let attempt = 0;
      let lastError = null;
      while (attempt < 2) {
        try {
          await send({ channel: campaign.channel, instanceName: evolutionInstanceId, number: phone, text: messageText });
          sentLog.push({ phone, variant, status: 'sent', at: new Date().toISOString() });
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
        sentLog.push({ phone, variant, status: 'failed', error: lastError.slice(0, 200), at: new Date().toISOString() });
        failed++;
      }
    }

    // Send each attachment as a media message
    for (const attachment of attachments) {
      const filePath = path.join(__dirname, '../../uploads/campaigns', attachment.file_path);
      let buffer;
      try {
        buffer = fs.readFileSync(filePath);
      } catch (e) {
        console.error(`Failed to read attachment file ${filePath}:`, e.message);
        sentLog.push({ phone, variant: attachment.original_name, status: 'failed', error: 'File read error', at: new Date().toISOString() });
        failed++;
        continue;
      }

      // Determine media type
      let mediaType = 'document';
      if (attachment.mimetype.startsWith('image/')) {
        mediaType = 'image';
      }

      // Convert to base64
      const base64Data = buffer.toString('base64');

      let attempt = 0;
      let lastError = null;
      while (attempt < 2) {
        try {
          await sendMedia(phone, mediaType, attachment.mimetype, base64Data, attachment.original_name, messageText);
          sentLog.push({ phone, variant: attachment.original_name, status: 'sent', at: new Date().toISOString() });
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
        sentLog.push({ phone, variant: attachment.original_name, status: 'failed', error: lastError.slice(0, 200), at: new Date().toISOString() });
        failed++;
      }
    }

    // Delay between contacts
    const { delay } = computeDelay(sent, failed);
    await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));
  }

  // Update campaign status
  const completedAt = new Date().toISOString();
  const status = failed === contacts.length ? 'failed' : (sent > 0 ? 'sent' : 'failed');
  db.prepare(`
    UPDATE campaigns
    SET status = ?, completedAt = ?, sentCount = ?, failedCount = ?, sentLog = ?
    WHERE id = ?
  `).run(status, completedAt, sent, failed, JSON.stringify(sentLog), campaignId);

  // Delete attachment files after sending (whether success or failure)
  for (const attachment of attachments) {
    const filePath = path.join(__dirname, '../../uploads/campaigns', attachment.file_path);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error(`Failed to delete attachment file ${filePath}:`, e.message);
      }
    }
  }

  return { sent, failed, total: contacts.length };
}

export async function tick() {
  const now = new Date();
  // Fetch campaigns that are due: status pending or queued and scheduledAt <= now (or scheduledAt is null)
  const campaigns = db.prepare(`
    SELECT id FROM campaigns
    WHERE (status = 'pending' OR status = 'queued')
      AND (scheduledAt IS NULL OR scheduledAt <= ?)
  `).all(now.toISOString());

  for (const { id } of campaigns) {
    console.log(`[v2-dispatcher] firing campaign ${id}`);
    try {
      await dispatchCampaign(id);
    } catch (e) {
      console.error(`[v2-dispatcher] campaign ${id} failed:`, e.message);
      // Mark campaign as failed
      db.prepare(`
        UPDATE campaigns
        SET status = ?, error = ?, completedAt = ?
        WHERE id = ?
      `).run('failed', e.message.slice(0, 200), new Date().toISOString(), id);
    }
  }
}