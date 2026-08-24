import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { toWhatsAppNumber } from '../utils/phone.js';
import db from '../db.js';

const CONFIG_PATH = process.env.GMAIL_CONFIG_PATH || path.join(process.cwd(), 'data', 'gmail-config.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.cwd(), 'data', 'gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const DEFAULT_REDIRECT = 'https://map-com.executioneveryday.com/api/v2/gmail/oauth2callback';

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

export function getSettings() {
  const config = loadConfig();
  return {
    clientId: config.clientId || process.env.GOOGLE_CLIENT_ID || '',
    clientSecretConfigured: Boolean(config.clientSecret || process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: config.redirectUri || process.env.GOOGLE_OAUTH_REDIRECT || DEFAULT_REDIRECT,
  };
}

export function updateSettings({ clientId, clientSecret, redirectUri }) {
  const current = loadConfig();
  const next = {
    clientId: String(clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim() || current.clientSecret || '',
    redirectUri: String(redirectUri || '').trim() || DEFAULT_REDIRECT,
  };
  if (!next.clientId) throw new Error('Google Client ID is required.');
  if (!next.clientSecret) throw new Error('Google Client Secret is required.');
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  return getSettings();
}

function redirectUri() { return getSettings().redirectUri; }

function oauthClient() {
  const config = loadConfig();
  const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Gmail OAuth is not configured. Add the Google Client ID and Secret in Admin Settings.');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri());
}

function loadTokens() { try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); } catch { return null; } }
function saveTokens(tokens) { fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true }); fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { mode: 0o600 }); }
export function isConnected() { return Boolean(loadTokens()); }
export function authorizationUrl() { return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES }); }
export async function handleCallback(code) { if (!code) throw new Error('Missing OAuth authorization code.'); const { tokens } = await oauthClient().getToken(code); saveTokens(tokens); return tokens; }

function htmlToText(value) { return String(value || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' '); }
function decodeBase64Url(value) { if (!value) return ''; return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function collectParts(part, output) { if (!part) return; const mime = part.mimeType || ''; if (part.body?.data && (mime === 'text/plain' || mime === 'text/html')) output.push(mime === 'text/html' ? htmlToText(decodeBase64Url(part.body.data)) : decodeBase64Url(part.body.data)); for (const child of part.parts || []) collectParts(child, output); }
function extractPhones(text) { const matches = String(text || '').match(/(?:\+212|00212|0[5-7])(?:[\s().-]*\d){8,9}/g) || []; return [...new Set(matches.map((value) => toWhatsAppNumber(value)).filter((value) => value.length >= 10))]; }

export async function searchAndImport({ query, userId, maxResults = 100 }) {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Gmail is not connected. Connect Gmail first.');
  const client = oauthClient(); client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: Math.min(Number(maxResults) || 100, 500) });
  const messageIds = (list.data.messages || []).map((message) => message.id);
  const phones = new Set(); const emails = [];
  for (const id of messageIds) {
    const message = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const textParts = []; collectParts(message.data.payload, textParts);
    const headers = message.data.payload?.headers || [];
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
    const found = extractPhones(`${subject} ${textParts.join(' ')}`);
    found.forEach((phone) => phones.add(phone)); emails.push({ id, subject, phones: found });
  }
  const inserted = []; const skipped = [];
  const insert = db.prepare('INSERT INTO contacts (user_id, name, phone, group_name) VALUES (?, ?, ?, ?)');
  const findExisting = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND phone = ?');
  db.transaction(() => { for (const phone of phones) { if (findExisting.get(userId, phone)) skipped.push(phone); else { insert.run(userId, 'Gmail Booking', phone, 'gmail_booking'); inserted.push(phone); } } })();
  return { query, emailsScanned: messageIds.length, phonesFound: phones.size, imported: inserted, skipped, emails };
}
