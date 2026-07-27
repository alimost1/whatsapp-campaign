import { Router } from 'express';
import axios from 'axios';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { sendTextMessage, sendImageMessage } from '../services/evolution.js';
import { computeDelay } from '../services/antiSpam.js';

const router = Router();
router.use(requireAuth);

// POST /api/campaigns/:id/send — send a campaign to its contacts
router.post('/:id/send', async (req, res) => {
  const { instanceName } = req.body;
  if (!instanceName) return res.status(400).json({ error: 'instanceName is required' });

  // Quick connectivity check before starting
  try {
    const { EVOLUTION_API_URL, EVOLUTION_API_KEY } = process.env;
    const checkRes = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      timeout: 8000,
    });
    const state = checkRes.data?.instance?.state || checkRes.data?.state || '';
    if (!['open'].includes(String(state).toLowerCase())) {
      return res.status(400).json({
        error: `WhatsApp not connected. Instance "${instanceName}" state: ${state || 'unknown'}. Please scan QR code first.`,
        state,
      });
    }
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error || e.message;
    return res.status(400).json({
      error: `Cannot reach Evolution API: ${status === 404 ? `Instance "${instanceName}" not found` : msg}`,
      details: msg,
    });
  }

  // Fetch campaign (404 if not found or belongs to another user)
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // Fetch contacts (all, or filtered by contact_group)
  let contacts;
  if (campaign.contact_group) {
    contacts = db
      .prepare('SELECT * FROM contacts WHERE user_id = ? AND group_name = ?')
      .all(req.userId, campaign.contact_group);
  } else {
    contacts = db.prepare('SELECT * FROM contacts WHERE user_id = ?').all(req.userId);
  }

  if (contacts.length === 0) {
    return res.status(400).json({ error: 'No contacts found for this campaign' });
  }

  // Update campaign status to 'sending' and record total_contacts
  db.prepare('UPDATE campaigns SET status = ?, total_contacts = ? WHERE id = ?')
    .run('sending', contacts.length, campaign.id);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    // Wait the computed delay before sending (skip delay before first message)
    if (i > 0) {
      const { delay } = computeDelay(sent, failed);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      if (campaign.image_path) {
        // Build a full URL for the image if it's a local path
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
      ).run(campaign.id, contact.id, contact.phone, 'sent');
      sent++;
    } catch (e) {
      db.prepare(
        'INSERT INTO send_logs (campaign_id, contact_id, phone, status, error_message) VALUES (?, ?, ?, ?, ?)'
      ).run(campaign.id, contact.id, contact.phone, 'failed', String(e.message).slice(0, 200));
      failed++;
    }

    // Update campaign progress after each send attempt
    db.prepare('UPDATE campaigns SET sent_count = ?, failed_count = ? WHERE id = ?')
      .run(sent, failed, campaign.id);
  }

  // Mark campaign as completed or failed
  const finalStatus = failed === contacts.length ? 'failed' : 'completed';
  db.prepare('UPDATE campaigns SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(finalStatus, campaign.id);

  res.json({ sent, failed, total: contacts.length });
});

// GET /api/campaigns/whatsapp/check — check WhatsApp connection via Evolution API
router.get('/whatsapp/check', async (req, res) => {
  const { instanceName } = req.query;
  if (!instanceName) return res.status(400).json({ error: 'instanceName query param required' });

  try {
    const { EVOLUTION_API_URL, EVOLUTION_API_KEY } = process.env;
    const response = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      timeout: 8000,
    });

    const state = response.data?.instance?.state || response.data?.state || 'unknown';
    const connected = ['open'].includes(String(state).toLowerCase());

    res.json({
      connected,
      state,
      instanceName,
      error: null,
    });
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error || e.message || 'Connection failed';
    res.json({
      connected: false,
      state: 'disconnected',
      instanceName,
      error: status === 404 ? 'Instance not found' : msg,
    });
  }
});

export default router;