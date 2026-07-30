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
router.use(requireAuth);

// ── Instances ─────────────────────────────────────────────
router.get('/instances', (req, res) => {
  const data = readJsonl(INSTANCES_FILE);
  res.json(data.filter((d) => d.name)); // skip the _comment lines
});

router.post('/instances', (req, res) => {
  const { name, purpose = '', tags = [], defaultChannel = 'evolution' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const instances = readJsonl(INSTANCES_FILE).filter((d) => d.name);
  if (instances.some((i) => i.name === name))
    return res.status(409).json({ error: `Instance "${name}" already exists` });
  const entry = { name, purpose, tags, defaultChannel, createdAt: new Date().toISOString() };
  appendJsonl(INSTANCES_FILE, entry);
  res.json(entry);
});

router.delete('/instances/:name', (req, res) => {
  const instances = readJsonl(INSTANCES_FILE).filter((d) => d.name);
  const next = instances.filter((i) => i.name !== req.params.name);
  writeJsonl(INSTANCES_FILE, next);
  res.json({ deleted: instances.length - next.length });
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
