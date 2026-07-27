import axios from 'axios';
import 'dotenv/config';

// Read env at function-call time (not module-load) so dotenv.config() in index.js has run first.

function getEvolutionUrl() {
  return (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
}
function getEvolutionKey() {
  return process.env.EVOLUTION_API_KEY || '';
}

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/**
 * Normalize phone number: strip all non-digits
 */
function normalizeNumber(number) {
  return String(number).replace(/[^0-9]/g, '');
}

/**
 * Random delay in ms between min and max (inclusive)
 */
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function authHeaders() {
  return { apikey: getEvolutionKey() };
}

/**
 * Send text message via Evolution API
 */
export async function sendTextMessage(instanceName, number, text) {
  const url = `${getEvolutionUrl()}/message/sendText/${instanceName}`;
  const payload = {
    number: normalizeNumber(number),
    text,
    delay: randomDelay(1000, 4000),
  };
  const res = await client.post(url, payload, { headers: authHeaders() });
  return res.data;
}

/**
 * Send image message via Evolution API
 * Uses /message/sendMedia with mediatype=image
 */
export async function sendImageMessage(instanceName, number, imageUrl, caption = '') {
  const url = `${getEvolutionUrl()}/message/sendMedia/${instanceName}`;
  const payload = {
    number: normalizeNumber(number),
    mediatype: 'image',
    media: imageUrl,
    mimetype: 'image/png',
    fileName: 'image.png',
    caption,
    delay: randomDelay(1000, 4000),
  };
  const res = await client.post(url, payload, { headers: authHeaders() });
  return res.data;
}