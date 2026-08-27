/**
 * v2 routes — multi-channel campaigns, A/B variants, scheduled sends, segmentation.
 * Mounted at /api/v2/* alongside v1 routes (which stay untouched).
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { dispatchCampaign } from '../services/v2Dispatcher.js';
import {
  phoneFromWebhook,
  attributeReply,
  computeVariantReport,
} from '../services/v2Attribution.js';
import { handleWhatsAppMessage, tickFollowUps } from '../services/whatsappAssistant.js';
import { checkInstance } from '../services/channels.js';
import { listAllLeads } from '../services/leadCapture.js';
import { ensureWebhook, getWebhook, buildWebhookUrl } from '../services/webhookConfig.js';
import { chat as chatAssistant, listCategoriesAPI } from '../services/v2Chat.js';
import { startScrapingJob, getJobStatus } from '../services/scraperApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.jsonl');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.jsonl');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.jsonl');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}
function writeJsonl(file, arr) {
  fs.writeFileSync(file, arr.map((x) => JSON.stringify(x)).join('\n') + '\n');
}
function id() {
  return crypto.randomBytes(6).toString('hex');
}

const router = Router();

// ── Webhook (public — Evolution API posts here, no JWT) ──────────────────
// POST /api/v2/webhooks/evolution — receives incoming WhatsApp messages from Evolution API
// Body shape: { event: 'messages.upsert' (or 'MESSAGES_UPSERT'), instance: 'xxx', data: { key: {...}, message: {...}, ... } }
//
// Two things happen for every incoming message:
//   1. attribution: match the phone to a recent campaign → log as a variant reply
//   2. assistant:   reply via the chat assistant (fire-and-forget, async)
router.post('/webhooks/evolution', (req, res) => {
  const body = req.body || {};
  const event = body.event;
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
    return res.json({ ignored: event });
  }
  const instanceName = body.instance;
  const phone = phoneFromWebhook(body);
  if (!phone) return res.json({ ignored: 'no phone or fromMe' });

  const text =
    body?.data?.message?.conversation ||
    body?.data?.message?.extendedTextMessage?.text ||
    '';
  const messageId = body?.data?.key?.id || null;
  const pushName = body?.data?.pushName || null;

  // 1. Attribution (synchronous — caller wants the result)
  const attribution = attributeReply({ phone, instanceName, messageId, pushName, text });

  // 2. Assistant reply (async, fire-and-forget) — only for direct chat messages
  handleWhatsAppMessage({ ...body, instance: instanceName })
    .then((r) => {
      if (r.replied) console.log(`[webhook] assistant replied: ${r.intent}`);
      else console.log(`[webhook] assistant skipped: ${r.reason}`);
    })
    .catch((e) => console.error('[webhook] assistant error:', e.message));

  if (!attribution) return res.json({ attributed: false, phone, instanceName });
  res.json({ attributed: true, phone, instanceName, ...attribution });
});

// GET /api/v2/test — test endpoint
router.get('/test', (req, res) => {
  res.json({ ok: true, message: 'v2 router working' });
});

// GET /api/v2/health — public health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// GET /api/v2/auth/me — get current user info
router.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ userId: user.id, email: user.email, name: user.name });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ── WhatsApp Test (public) ──────────────────────────────────
// POST /api/v2/whatsapp/test — send test message via Evolution API
router.post('/whatsapp/test', async (req, res) => {
  try {
    const { instance, number, message } = req.body;
    if (!instance || !number || !message) {
      return res.status(400).json({ error: 'instance, number, and message are required' });
    }

    const [ok, errMsg] = await checkInstance(instance);
    if (!ok) return res.status(400).json({ error: errMsg });

    const { EVOLUTION_API_URL, EVOLUTION_API_KEY } = process.env;
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${instance}`,
      { number, text: message, delay: 1000 },
      { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    res.json({ ok: true, messageId: response.data?.key?.id });
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error || e.message;
    res.status(500).json({ error: `Failed to send: ${msg}` });
  }
});

// ── Google Maps Scraper (public) ────────────────────────────
// POST /api/v2/scraper/google-maps — start a scraping job
router.post('/scraper/google-maps', async (req, res) => {
  try {
    const { category, location, maxResults, headless } = req.body;
    if (!category || !location) {
      return res.status(400).json({ error: 'category and location are required' });
    }
    const result = await startScrapingJob({ category, location, maxResults, headless });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v2/scraper/status/:jobId — get job status/results
router.get('/scraper/status/:jobId', (req, res) => {
  const job = getJobStatus(req.params.jobId);
  if (job.error) return res.status(404).json(job);
  res.json(job);
});

router.use(requireAuth);

// ── Instances ─────────────────────────────────────────────
router.get('/instances', (req, res) => {
  const data = readJsonl(INSTANCES_FILE);
  res.json(data.filter((d) => d.name)); // skip the _comment lines
});

router.post('/instances', async (req, res) => {
  const { name, purpose = '', tags = [], defaultChannel = 'evolution' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const instances = readJsonl(INSTANCES_FILE).filter((d) => d.name);
  if (instances.some((i) => i.name === name))
    return res.status(409).json({ error: `Instance "${name}" already exists` });
  const entry = { name, purpose, tags, defaultChannel, createdAt: new Date().toISOString() };
  appendJsonl(INSTANCES_FILE, entry);
  // Auto-configure webhook so replies land at /api/v2/webhooks/evolution.
  // Non-fatal — if instance doesn't exist on Evolution yet (waiting for QR),
  // log it but still return success.
  const webhookResult = await ensureWebhook(name);
  res.json({ instance: entry, webhook: webhookResult });
});

router.delete('/instances/:name', (req, res) => {
  const instances = readJsonl(INSTANCES_FILE).filter((d) => d.name);
  const next = instances.filter((i) => i.name !== req.params.name);
  writeJsonl(INSTANCES_FILE, next);
  res.json({ deleted: instances.length - next.length });
});

// POST /api/v2/instances/:name/sync-webhook — manually (re-)configure webhook
router.post('/instances/:name/sync-webhook', async (req, res) => {
  const result = await ensureWebhook(req.params.name);
  if (!result.ok) return res.status(502).json(result);
  res.json(result);
});

// GET /api/v2/instances/:name/webhook-status — verify what's currently configured
router.get('/instances/:name/webhook-status', async (req, res) => {
  const expectedUrl = buildWebhookUrl();
  const current = await getWebhook(req.params.name);
  if (!current.ok) return res.status(502).json({ expectedUrl, current });
  res.json({
    expectedUrl,
    configured: current.config,
    match: current.config?.webhook?.url === expectedUrl,
  });
});

// ── Campaigns ─────────────────────────────────────────────
router.get('/campaigns', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  res.json(campaigns);
});

router.post('/campaigns', (req, res) => {
  const {
    name,
    channel = 'evolution', // 'evolution' | 'cloud_api'
    instanceName = null, // required when channel === 'evolution'
    message, // string OR { variants: ['A', 'B'] }
    targetTags = [], // ['hot-buyer'] or ['hot-buyer','villa']
    targetTagMode = 'OR', // 'AND' | 'OR'
    scheduledAt = null, // ISO timestamp; null = immediate
    contacts = null, // explicit list, or null to filter from contacts.jsonl
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!message) return res.status(400).json({ error: 'message (or variants) is required' });
  if (channel === 'evolution' && !instanceName)
    return res.status(400).json({ error: 'instanceName is required for Evolution channel' });

  const campaign = {
    id: id(),
    name,
    channel,
    instanceName,
    message,
    targetTags,
    targetTagMode,
    scheduledAt,
    contacts: contacts || null,
    status: scheduledAt ? 'pending' : 'queued',
    createdAt: new Date().toISOString(),
    sentLog: [],
  };
  appendJsonl(CAMPAIGNS_FILE, campaign);
  res.json(campaign);
});

router.get('/campaigns/:cid', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const c = campaigns.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

router.delete('/campaigns/:cid', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const next = campaigns.filter((c) => c.id !== req.params.cid);
  writeJsonl(CAMPAIGNS_FILE, next);
  res.json({ deleted: campaigns.length - next.length });
});

router.put('/campaigns/:cid', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const idx = campaigns.findIndex((c) => c.id === req.params.cid);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updated = { ...campaigns[idx], ...req.body, id: campaigns[idx].id, createdAt: campaigns[idx].createdAt };
  campaigns[idx] = updated;
  writeJsonl(CAMPAIGNS_FILE, campaigns);
  res.json(updated);
});

// POST /api/v2/campaigns/:cid/send-now — kick off dispatch immediately (no waiting for cron)
router.post('/campaigns/:cid/send-now', async (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const c = campaigns.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'campaign not found' });
  if (c.status === 'sending') return res.status(409).json({ error: 'already sending' });
  if (c.status === 'sent') return res.status(409).json({ error: 'already sent' });
  // Set status to pending so dispatcher picks it up
  c.status = 'pending';
  const all = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const idx = all.findIndex((x) => x.id === c.id);
  if (idx >= 0) {
    all[idx] = c;
    writeJsonl(CAMPAIGNS_FILE, all);
  }
  // Fire and forget — return immediately
  dispatchCampaign(c.id).catch((e) => console.error('[v2-dispatcher]', e));
  res.status(202).json({ campaignId: c.id, status: 'pending' });
});

// GET /api/v2/campaigns/:cid/progress — live progress (sent/failed/total + status)
router.get('/campaigns/:cid/progress', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const c = campaigns.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'not found' });
  const sent = (c.sentLog || []).filter((s) => s.status === 'sent').length;
  const failed = (c.sentLog || []).filter((s) => s.status === 'failed').length;
  res.json({
    status: c.status,
    sent,
    failed,
    total: (c.sentLog || []).length,
    summary: c.summary || null,
    startedAt: c.startedAt || null,
    completedAt: c.completedAt || null,
  });
});

// GET /api/v2/campaigns/:cid/results — A/B variant performance report
router.get('/campaigns/:cid/results', (req, res) => {
  const report = computeVariantReport(req.params.cid);
  if (!report) return res.status(404).json({ error: 'campaign not found' });
  res.json(report);
});

// GET /api/v2/logs — get recent send logs for user's campaigns
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    let allLogs = [];
    
    // 1. Get logs from SQLite campaigns (v1)
    const campaignIds = db.prepare('SELECT id FROM campaigns WHERE user_id = ?').all(req.userId).map(c => c.id);
    if (campaignIds.length > 0) {
      const placeholders = campaignIds.map(() => '?').join(',');
      const sqlLogs = db.prepare(`
        SELECT sl.*, c.name as campaign_name
        FROM send_logs sl
        JOIN campaigns c ON sl.campaign_id = c.id
        WHERE sl.campaign_id IN (${placeholders})
        ORDER BY sl.sent_at DESC
        LIMIT ?
      `).all(...campaignIds, limit);
      allLogs.push(...sqlLogs);
    }
    
    // 2. Get logs from JSONL campaigns (v2)
    const v2Campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
    for (const campaign of v2Campaigns) {
      if (campaign.sentLog && Array.isArray(campaign.sentLog)) {
        for (const log of campaign.sentLog) {
          allLogs.push({
            id: log.id || `${campaign.id}-${log.variant}-${log.at}`,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            phone: log.phone,
            variant: log.variant,
            status: log.status,
            error_message: log.error,
            sent_at: log.at,
            level: log.status === 'sent' ? 'info' : 'error',
            message: log.status === 'sent' ? `Message sent to ${log.phone} (${log.variant})` : `Failed to send to ${log.phone}: ${log.error}`,
            meta: { variant: log.variant }
          });
        }
      }
    }
    
    // Sort by sent_at descending and limit
    allLogs.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    res.json(allLogs.slice(0, limit));
  } catch (e) {
    console.error('Failed to fetch logs:', e);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── Chat assistant (Promo Immo Marrakech) ─────────────────
// POST /api/v2/chat — body: { message: "..." }
router.post('/chat', async (req, res) => {
  try {
    const result = await chatAssistant(req.body?.message);
    res.json(result);
  } catch (e) {
    res.status(500).json({ intent: 'error', text: 'Erreur: ' + e.message });
  }
});

// GET /api/v2/chat/categories — list property categories
router.get('/chat/categories', (req, res) => {
  res.json(listCategoriesAPI());
});

// GET /api/v2/chat/leads — list all chat leads (dashboard)
router.get('/chat/leads', (req, res) => {
  res.json(listAllLeads());
});

// POST /api/v2/chat/follow-ups — manually trigger follow-up sweep
router.post('/chat/follow-ups', async (req, res) => {
  const result = await tickFollowUps();
  res.json(result);
});

// ── Contacts (segmentation) ───────────────────────────────
router.get('/contacts', (req, res) => {
  const contacts = readJsonl(CONTACTS_FILE).filter((d) => d.phone);
  res.json(contacts);
});

router.post('/contacts', (req, res) => {
  const { phone, name = '', tags = [], source = 'manual' } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  const contacts = readJsonl(CONTACTS_FILE).filter((d) => d.phone);
  const entry = { phone, name, tags, source, createdAt: new Date().toISOString() };
  appendJsonl(CONTACTS_FILE, entry);
  res.json(entry);
});

router.patch('/contacts/:phone/tags', (req, res) => {
  const { add = [], remove = [] } = req.body;
  const contacts = readJsonl(CONTACTS_FILE).filter((d) => d.phone);
  const idx = contacts.findIndex((c) => c.phone === req.params.phone);
  if (idx === -1) return res.status(404).json({ error: 'contact not found' });
  const tags = new Set(contacts[idx].tags || []);
  for (const t of add) tags.add(t);
  for (const t of remove) tags.delete(t);
  contacts[idx].tags = [...tags];
  writeJsonl(CONTACTS_FILE, contacts);
  res.json(contacts[idx]);
});

/**
 * Resolve target contacts for a campaign — either from explicit list,
 * or by filtering contacts.jsonl with tag match.
 */
router.post('/campaigns/:cid/resolve-targets', (req, res) => {
  const campaigns = readJsonl(CAMPAIGNS_FILE).filter((d) => d.id);
  const c = campaigns.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'campaign not found' });

  if (c.contacts && Array.isArray(c.contacts)) {
    return res.json({ count: c.contacts.length, contacts: c.contacts });
  }

  const contacts = readJsonl(CONTACTS_FILE).filter((d) => d.phone);
  const filtered = contacts.filter((contact) => {
    const tags = contact.tags || [];
    if (c.targetTagMode === 'AND') return c.targetTags.every((t) => tags.includes(t));
    return c.targetTags.some((t) => tags.includes(t));
  });
  res.json({ count: filtered.length, contacts: filtered });
});

export default router;