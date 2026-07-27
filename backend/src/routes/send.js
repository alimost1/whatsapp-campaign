import { Router } from 'express';
import axios from 'axios';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { enqueue, isQueuedOrRunning } from '../services/campaignWorker.js';

const router = Router();
router.use(requireAuth);

/**
 * Pre-flight: check that the Evolution instance exists and is connected.
 * Returns a tuple [ok, errorMessage].
 */
async function checkInstance(instanceName) {
  try {
    const { EVOLUTION_API_URL, EVOLUTION_API_KEY } = process.env;
    const res = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      timeout: 8000,
    });
    const state = res.data?.instance?.state || res.data?.state || '';
    if (!['open'].includes(String(state).toLowerCase())) {
      return [false, `WhatsApp not connected. Instance "${instanceName}" state: ${state || 'unknown'}. Please scan QR code first.`];
    }
    return [true, null];
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error || e.message;
    const detail = status === 404 ? `Instance "${instanceName}" not found` : msg;
    return [false, `Cannot reach Evolution API: ${detail}`];
  }
}

// POST /api/campaigns/:id/send — enqueue a campaign for background sending
router.post('/:id/send', async (req, res) => {
  const { instanceName } = req.body;
  if (!instanceName) return res.status(400).json({ error: 'instanceName is required' });

  // Verify campaign ownership
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // Reject if already sending or queued
  if (isQueuedOrRunning(Number(req.params.id))) {
    return res.status(409).json({ error: 'Campaign is already sending' });
  }

  // Only allow fresh send from 'draft' or 'completed'/'failed' states (resets counts)
  if (!['draft', 'completed', 'failed'].includes(campaign.status)) {
    return res.status(400).json({ error: `Cannot send campaign with status '${campaign.status}'` });
  }

  // Pre-flight: verify contacts exist
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

  // Pre-flight: verify Evolution instance is connected
  const [ok, errMsg] = await checkInstance(instanceName);
  if (!ok) return res.status(400).json({ error: errMsg });

  // Persist instance_name + reset counts/logs for a fresh send
  db.prepare('DELETE FROM send_logs WHERE campaign_id = ?').run(campaign.id);
  db.prepare(
    `UPDATE campaigns SET status = ?, total_contacts = ?, sent_count = 0, failed_count = 0,
       instance_name = ? WHERE id = ?`
  ).run('sending', contacts.length, instanceName, campaign.id);

  // Enqueue for background processing
  const queued = enqueue(campaign.id);
  if (!queued) {
    return res.status(409).json({ error: 'Campaign is already sending' });
  }

  return res.status(202).json({
    campaignId: campaign.id,
    status: 'sending',
    total: contacts.length,
    message: 'Campaign queued for sending',
  });
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

    res.json({ connected, state, instanceName, error: null });
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
