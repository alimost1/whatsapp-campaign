/**
 * Channel abstraction — choose between Evolution API and WhatsApp Cloud API.
 * Both functions normalize the response shape so the worker doesn't care
 * which channel sent the message.
 */
import axios from 'axios';
import 'dotenv/config';

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

function normalize(number) {
  return String(number).replace(/[^0-9]/g, '');
}

/**
 * Send via Evolution API. Unofficial, supports images, no template restrictions.
 */
export async function sendViaEvolution(instanceName, number, text) {
  const url = `${getEvolutionUrl()}/message/sendText/${instanceName}`;
  const payload = { number: normalize(number), text, delay: 1500 };
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
    to: normalize(number),
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
