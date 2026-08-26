/**
 * v2 dispatcher — scans SQLite campaigns table for scheduled campaigns whose
 * scheduledAt is due, then sends them via the chosen channel with attachments.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { sendMedia, sendText } from './channels.js';
import { computeDelay } from './antiSpam.js';
import db from '../db.js';
import { toWhatsAppNumber } from '../utils/phone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pickVariant(message, contactPhone, campaignId) {
  if (message && Array.isArray(message.variants)) {
    const seed = crypto.createHash('sha256').update(`${campaignId}:${contactPhone}`).digest();
    const idx = seed.readUInt32BE(0) % message.variants.length;
    return { text: message.variants[idx], variant: String.fromCharCode(65 + idx) };
  }
  return { text: String(message || ''), variant: 'A' };
}

function getMediaType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'document';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'document';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'document';
  if (mimeType === 'text/plain') return 'document';
  return 'document';
}

export async function dispatchCampaign(campaignId) {
  // Fetch campaign from SQLite
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.status === 'sent' || campaign.status === 'completed' || campaign.status === 'sending') {
    return { skipped: 'already ' + campaign.status };
  }

  // Fetch attachments
  const attachments = db.prepare(`
    SELECT id, file_path, original_name, mime_type, size
    FROM campaign_attachments
    WHERE campaign_id = ?
    ORDER BY created_at
  `).all(campaignId);

  // Resolve contacts from SQLite
  let contacts = [];
  if (campaign.contact_group) {
    contacts = db.prepare(`
      SELECT id, name, phone FROM contacts 
      WHERE user_id = ? AND group_name = ? AND phone IS NOT NULL
    `).all(campaign.user_id, campaign.contact_group);
  } else {
    contacts = db.prepare(`
      SELECT id, name, phone FROM contacts 
      WHERE user_id = ? AND phone IS NOT NULL
    `).all(campaign.user_id);
  }

  // Normalize and deduplicate
  const seen = new Set();
  contacts = contacts
    .map((contact) => ({
      ...contact,
      phone: toWhatsAppNumber(contact.phone)
    }))
    .filter((contact) => {
      if (!contact.phone || contact.phone.length < 10 || seen.has(contact.phone)) return false;
      seen.add(contact.phone);
      return true;
    });

  console.log(`[v2-dispatcher] campaign ${campaign.id} resolved ${contacts.length} targets`);

  if (!contacts.length) {
    db.prepare('UPDATE campaigns SET status = ?, error = ?, completedAt = ? WHERE id = ?')
      .run('failed', 'no contacts resolved', new Date().toISOString(), campaignId);
    return { skipped: 'no contacts' };
  }

  // Update campaign status to sending
  db.prepare('UPDATE campaigns SET status = ?, startedAt = ?, total_contacts = ? WHERE id = ?')
    .run('sending', new Date().toISOString(), contacts.length, campaignId);

  let sent = 0;
  let failed = 0;
  const sentLog = [];

  for (const contact of contacts) {
    const phone = contact.phone;
    const { text, variant } = pickVariant(campaign.message_text, phone, campaignId);
    let attempt = 0;
    let lastError = null;

    while (attempt < 2) {
      try {
        if (attachments.length > 0) {
          // Send with attachments - send each attachment
          for (const attachment of attachments) {
            const filePath = path.join(__dirname, '../../uploads/campaigns', attachment.file_path);
            if (!fs.existsSync(filePath)) {
              throw new Error(`Attachment file not found: ${filePath}`);
            }
            
            const fileBuffer = fs.readFileSync(filePath);
            const base64Media = fileBuffer.toString('base64');
            const mediaType = getMediaType(attachment.mime_type);
            
            await sendMedia({
              channel: campaign.channel || 'evolution',
              instanceName: campaign.instanceName || 'promo',
              number: phone,
              media: base64Media,
              mediatype: mediaType,
              mimetype: attachment.mime_type,
              caption: text,
              filename: attachment.original_name
            });
          }
        } else {
          // Send text only
          await sendText({
            channel: campaign.channel || 'evolution',
            instanceName: campaign.instanceName || 'promo',
            number: phone,
            text
          });
        }
        
        sentLog.push({ 
          contact_id: contact.id, 
          phone, 
          variant, 
          status: 'sent', 
          at: new Date().toISOString() 
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
      sentLog.push({ 
        contact_id: contact.id, 
        phone, 
        variant, 
        status: 'failed', 
        error: lastError.slice(0, 200), 
        at: new Date().toISOString() 
      });
      failed++;
    }

    // Save log to database
    if (sentLog.length > 0) {
      const lastLog = sentLog[sentLog.length - 1];
      db.prepare(`
        INSERT INTO send_logs (campaign_id, contact_id, phone, status, error_message, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(campaignId, lastLog.contact_id || null, lastLog.phone, lastLog.status, lastLog.error || null, lastLog.at);
    }

    // Update progress in database
    db.prepare('UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?')
      .run(sent, failed, campaignId);

    // Delay between contacts
    const { delay } = computeDelay(sent, failed);
    await new Promise((r) => setTimeout(r, Math.min(delay, 5000)));
  }

  // Update final campaign status
  const completedAt = new Date().toISOString();
  const status = failed === contacts.length ? 'failed' : (sent > 0 ? 'completed' : 'failed');
  db.prepare(`
    UPDATE campaigns
    SET status = ?, completedAt = ?, sent_count = ?, failed_count = ?, sentLog = ?
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