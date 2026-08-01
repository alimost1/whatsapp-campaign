/**
 * v2 routes — multi-channel campaigns, A/B variants, scheduled sends, segmentation.
 * Mounted at /api/v2/* alongside v1 routes (which stay untouched).
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { requireAuth } from '../auth.js';
import { dispatchCampaign } from '../services/v2Dispatcher.js';
import {
  phoneFromWebhook,
  attributeReply,
  computeVariantReport,
} from '../services/v2Attribution.js';
import { ensureWebhook, getWebhook, buildWebhookUrl } from '../services/webhookConfig.js';
import { chat as chatAssistant, listCategoriesAPI } from '../services/v2Chat.js';

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
// Body shape: { event: 'messages.upsert', instance: 'xxx', data: { key: {...}, message: {...}, ... } }
router.post('/webhooks/evolution', (req, res) => {
  const body = req.body || {};
  const event = body.event;
  // Evolution may send either 'messages.upsert' (lowercase) or 'MESSAGES_UPSERT' (uppercase enum)
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

  const result = attributeReply({ phone, instanceName, messageId, pushName, text });
  if (!result) return res.json({ attributed: false, phone, instanceName });
  res.json({ attributed: true, phone, instanceName, ...result });
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
