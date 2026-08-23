/**
 * Channel abstraction — choose between Evolution API and WhatsApp Cloud API.
 * Both functions normalize the response shape so the worker doesn't care
 * which channel sent the message.
 */
import axios from 'axios';
import 'dotenv/config';
import { toWhatsAppNumber } from '../utils/phone.js';

function getEvolutionUrl() {
  return (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
}
function getEvolutionKey() {
  return process.env.EVOLUTION_API_KEY || '';
}
function getCloudToken() {
  return process.env.CLOUD_API_TOKEN || '';
}
function getCloudPhoneId() {
  return process.env.CLOUD_API_PHONE_ID || '';
}

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/**
 * Send via Evolution API. Unofficial, supports images, no template restrictions.
 */
export async function sendViaEvolution(instanceName, number, text) {
  const url = `${getEvolutionUrl()}/message/sendText/${instanceName}`;
  const payload = { number: toWhatsAppNumber(number), text, delay: 1500 };
  const res = await client.post(url, payload, { headers: { apikey: getEvolutionKey() } });
  return {
    ok: true,
    channel: 'evolution',
    instance: instanceName,
    providerId: res.data?.key?.id,
    raw: res.data,
  };
}

/**
 * Send via WhatsApp Business Cloud API. Official, no ban risk,
 * BUT requires a pre-approved template if outside the 24h customer service window.
 */
export async function sendViaCloudApi(number, text) {
  const url = `https://graph.facebook.com/v20.0/${getCloudPhoneId()}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toWhatsAppNumber(number),
    type: 'text',
    text: { body: text },
  };
  const res = await client.post(url, payload, {
    headers: { Authorization: `Bearer ${getCloudToken()}` },
  });
  return {
    ok: true,
    channel: 'cloud_api',
    providerId: res.data?.messages?.[0]?.id,
    raw: res.data,
  };
}

/**
 * Dispatcher — picks channel based on config or explicit argument.
 */
export async function send({ channel, instanceName, number, text }) {
  if (channel === 'cloud_api') return sendViaCloudApi(number, text);
  if (channel === 'evolution') return sendViaEvolution(instanceName, number, text);
  throw new Error(`Unknown channel: ${channel}`);
}

/** Check if Evolution instance is connected. */
export async function checkInstance(instanceName) {
  try {
    const url = `${getEvolutionUrl()}/instance/connectionState/${instanceName}`;
    const res = await client.get(url, { headers: { apikey: getEvolutionKey() }, timeout: 8000 });
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
