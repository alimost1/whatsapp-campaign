/**
 * Lead capture for WhatsApp chat interactions.
 *
 * - Saves every incoming chat message as a lead (or updates existing lead).
 * - Tracks: phone, pushName, lastMessage, lastIntent, messageCount, firstSeen, lastSeen
 * - Used by auto-follow-up cron to find "stale" leads who never replied back.
 *
 * Storage: data/chat_leads.jsonl (JSONL, append-only).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const LEADS_FILE = path.join(DATA_DIR, 'chat_leads.jsonl');

function readLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return fs
    .readFileSync(LEADS_FILE, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function writeLeads(leads) {
  const body = leads.map((l) => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(LEADS_FILE, body);
}

/**
 * Record or update a lead from a chat interaction.
 * Returns the updated lead.
 */
export function recordLead({ phone, pushName, message, intent, instanceName }) {
  const leads = readLeads();
  let lead = leads.find((l) => l.phone === phone);
  const now = new Date().toISOString();
  if (!lead) {
    lead = {
      phone,
      pushName: pushName || null,
      firstSeen: now,
      lastSeen: now,
      lastMessage: message || '',
      lastIntent: intent || 'unknown',
      instanceName: instanceName || null,
      messageCount: 0,
      followUpsSent: 0,
      lastFollowUpAt: null,
      contacted: false,
    };
    leads.push(lead);
  }
  lead.pushName = pushName || lead.pushName;
  lead.lastSeen = now;
  lead.lastMessage = message || lead.lastMessage;
  lead.lastIntent = intent || lead.lastIntent;
  lead.instanceName = instanceName || lead.instanceName;
  lead.messageCount = (lead.messageCount || 0) + 1;
  writeLeads(leads);
  return lead;
}

/**
 * List leads that haven't been contacted in `staleMs` milliseconds
 * and haven't received a follow-up recently.
 */
export function listStaleLeads(staleMs = 24 * 60 * 60 * 1000) {
  const leads = readLeads();
  const now = Date.now();
  return leads.filter((l) => {
    const lastActivity = Math.max(
      new Date(l.lastSeen || l.firstSeen).getTime(),
      new Date(l.lastFollowUpAt || 0).getTime()
    );
    return now - lastActivity > staleMs && (l.followUpsSent || 0) < 2;
  });
}

/**
 * Mark a lead as followed-up.
 */
export function markFollowUpSent(phone) {
  const leads = readLeads();
  const lead = leads.find((l) => l.phone === phone);
  if (!lead) return null;
  lead.followUpsSent = (lead.followUpsSent || 0) + 1;
  lead.lastFollowUpAt = new Date().toISOString();
  writeLeads(leads);
  return lead;
}

/**
 * Get all leads (for the dashboard).
 */
export function listAllLeads() {
  return readLeads().sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}
