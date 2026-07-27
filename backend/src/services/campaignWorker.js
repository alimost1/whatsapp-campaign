/**
 * In-process campaign send worker.
 *
 * - One campaign at a time (protects WhatsApp anti-spam session; avoids parallel sends on same instance).
 * - Resume support: on boot, re-enqueues campaigns whose status is 'sending'.
 * - Skips contacts already attempted by querying send_logs.
 */
import db from '../db.js';
import { sendTextMessage, sendImageMessage } from './evolution.js';
import { computeDelay } from './antiSpam.js';

// In-memory state
const queue = []; // FIFO array of campaignIds
const running = new Set(); // currently-processing campaignIds
const queued = new Set(); // queued (not yet processing) campaignIds
let processorActive = false;

const log = (...args) => console.log('[worker]', ...args);

/**
 * Enqueue a campaign. Returns true if added, false if already queued/running.
 */
export function enqueue(campaignId) {
  if (running.has(campaignId) || queued.has(campaignId)) {
    return false;
  }
  queued.add(campaignId);
  queue.push(campaignId);
  log('enqueued campaign', campaignId, '| queue size:', queue.length);
  kickProcessor();
  return true;
}

export function isQueuedOrRunning(campaignId) {
  return running.has(campaignId) || queued.has(campaignId);
}

/**
 * Start the processor loop if not already running.
 */
function kickProcessor() {
  if (processorActive) return;
  processorActive = true;
  processQueue().catch((e) => {
    log('processor crashed:', e.message);
    processorActive = false;
  });
}

async function processQueue() {
  while (queue.length > 0) {
    const campaignId = queue.shift();
    queued.delete(campaignId);
    if (!campaignId) continue;
    running.add(campaignId);
    try {
      await runCampaign(campaignId);
    } catch (e) {
      log('runCampaign failed for', campaignId, ':', e.message);
      try {
        db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
      } catch {}
    } finally {
      running.delete(campaignId);
    }
  }
  processorActive = false;
}

/**
 * Process one campaign end-to-end. Resumes from contacts not yet in send_logs.
 */
async function runCampaign(campaignId) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    log('campaign', campaignId, 'not found');
    return;
  }
  if (campaign.status !== 'sending') {
    log('campaign', campaignId, 'status is', campaign.status, '— skipping');
    return;
  }

  const instanceName = campaign.instance_name;
  if (!instanceName) {
    log('campaign', campaignId, 'has no instance_name — cannot resume');
    db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
    return;
  }

  // Load contacts (respect contact_group filter)
  let contacts;
  if (campaign.contact_group) {
    contacts = db
      .prepare('SELECT * FROM contacts WHERE user_id = ? AND group_name = ?')
      .all(campaign.user_id, campaign.contact_group);
  } else {
    contacts = db.prepare('SELECT * FROM contacts WHERE user_id = ?').all(campaign.user_id);
  }

  if (!contacts.length) {
    log('campaign', campaignId, 'has no contacts — marking failed');
    db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
    return;
  }

  // Skip contacts already attempted (resume support)
  const sentPhones = new Set(
    db.prepare('SELECT phone FROM send_logs WHERE campaign_id = ?').all(campaignId).map((r) => r.phone)
  );
  const pending = contacts.filter((c) => !sentPhones.has(c.phone));

  log('campaign', campaignId, '| contacts:', contacts.length, '| already attempted:', sentPhones.size, '| pending:', pending.length);

  if (pending.length === 0) {
    // Nothing left to send — finalize based on existing counts
    const row = db.prepare('SELECT sent_count, failed_count FROM campaigns WHERE id = ?').get(campaignId);
    const finalStatus = row.sent_count > 0 ? 'completed' : 'failed';
    db.prepare("UPDATE campaigns SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      finalStatus,
      campaignId
    );
    log('campaign', campaignId, 'all done on resume — marking', finalStatus);
    return;
  }

  // Make sure total_contacts reflects the campaign's contact list (only if not yet set)
  if (!campaign.total_contacts) {
    db.prepare('UPDATE campaigns SET total_contacts = ? WHERE id = ?').run(contacts.length, campaignId);
  }

  let sent = campaign.sent_count || 0;
  let failed = campaign.failed_count || 0;
  let attempted = sent + failed; // for computeDelay input

  for (let i = 0; i < pending.length; i++) {
    const contact = pending[i];

    if (i > 0) {
      const { delay, reason } = computeDelay(attempted, failed);
      log('campaign', campaignId, '| waiting', Math.round(delay / 1000), 's (', reason, ') before next send');
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      if (campaign.image_path) {
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        const imageUrl = campaign.image_path.startsWith('http')
          ? campaign.image_path
          : `${baseUrl}${campaign.image_path}`;
        await sendImageMessage(instanceName, contact.phone, imageUrl, campaign.message_text);
      } else {
        await sendTextMessage(instanceName, contact.phone, campaign.message_text);
      }
      db.prepare(
        'INSERT INTO send_logs (campaign_id, contact_id, phone, status) VALUES (?, ?, ?, ?)'
      ).run(campaignId, contact.id, contact.phone, 'sent');
      sent++;
    } catch (e) {
      db.prepare(
        'INSERT INTO send_logs (campaign_id, contact_id, phone, status, error_message) VALUES (?, ?, ?, ?, ?)'
      ).run(campaignId, contact.id, contact.phone, 'failed', String(e.message).slice(0, 200));
      failed++;
    }
    attempted++;

    // Update counts after every attempt
    db.prepare('UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?').run(
      sent,
      failed,
      campaignId
    );
  }

  // Final status: completed if any sent, failed if all failed
  const finalStatus = failed === contacts.length ? 'failed' : 'completed';
  db.prepare(
    "UPDATE campaigns SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(finalStatus, campaignId);

  log('campaign', campaignId, 'done — status:', finalStatus, '| sent:', sent, '| failed:', failed);
}

/**
 * Resume any campaigns that were mid-send when the server stopped.
 */
export function resumeInterruptedCampaigns() {
  const stuck = db.prepare("SELECT id FROM campaigns WHERE status = 'sending'").all();
  if (!stuck.length) {
    log('no interrupted campaigns to resume');
    return;
  }
  log('resuming', stuck.length, 'interrupted campaign(s):', stuck.map((r) => r.id).join(','));
  for (const row of stuck) {
    enqueue(row.id);
  }
}
