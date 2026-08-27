/**
 * Webhook self-configuration — tells Evolution API where to send
 * incoming WhatsApp messages so v2Attribution can match replies to campaigns.
 *
 * Idempotent: calling POST /webhook/set repeatedly with the same URL
 * overwrites — no duplicate side effects.
 *
 * Triggered:
 *   1. Manually via POST /api/v2/instances/:name/sync-webhook
 *   2. Automatically on POST /api/v2/instances (newly registered instance)
 *   3. As a safety net at the start of dispatchCampaign()
 */
import axios from 'axios';

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8082';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

export const WEBHOOK_PATH = '/api/v2/webhooks/evolution';
export const WEBHOOK_EVENTS = ['MESSAGES_UPSERT'];

export function buildWebhookUrl() {
  return `${BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`;
}

/**
 * Push webhook config to Evolution API for a single instance.
 * Returns { ok: true, url } on success, { ok: false, error } on failure.
 */
export async function ensureWebhook(instanceName) {
  if (!instanceName) return { ok: false, error: 'no instance name' };
  const url = `${EVOLUTION_URL}/webhook/set/${encodeURIComponent(instanceName)}`;
  const body = {
    webhook: {
      enabled: true,
      url: buildWebhookUrl(),
      events: WEBHOOK_EVENTS,
      byEvents: false,
      base64: false,
    },
  };
  try {
    const r = await axios.post(url, body, {
      headers: {
        apikey: EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, url: buildWebhookUrl(), response: r.data };
    }
    return {
      ok: false,
      error: `Evolution ${r.status}: ${typeof r.data === 'string' ? r.data : JSON.stringify(r.data)}`,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Read current webhook config from Evolution API.
 */
export async function getWebhook(instanceName) {
  const url = `${EVOLUTION_URL}/webhook/find/${encodeURIComponent(instanceName)}`;
  try {
    const r = await axios.get(url, {
      headers: { apikey: EVOLUTION_KEY },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300) return { ok: true, config: r.data };
    return { ok: false, status: r.status, error: r.data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
