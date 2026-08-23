import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  'https://map-com.executioneveryday.com',
  'http://localhost:5173'
];

// Custom CORS middleware that handles everything
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('=== CORS DEBUG ===');
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  console.log('Origin header:', origin);
  console.log('Allowed origins:', allowedOrigins);

  if (req.method === 'OPTIONS') {
    console.log('Preflight request detected');

    if (!origin) {
      console.log('No origin header - allowing');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
      res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      return res.status(204).end();
    }

    if (allowedOrigins.includes(origin)) {
      console.log('Origin allowed - echoing back');
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
      res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      return res.status(204).end();
    } else {
      console.log('Origin NOT allowed:', origin);
      return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }
  }

  // For non-OPTIONS requests, set CORS headers
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// ── API routes ───────────────────────────────────────────
import authRouter from './routes/auth.js';
import contactsRouter from './routes/contacts.js';
import uploadRouter from './routes/upload.js';
import campaignsRouter from './routes/campaigns.js';
import sendRouter from './routes/send.js';
import v2Router from './routes/v2.js';
import { resumeInterruptedCampaigns } from './services/campaignWorker.js';
import { tick as v2Tick } from './services/v2Dispatcher.js';
import { tickFollowUps } from './services/whatsappAssistant.js';

// v2 mounts (canonical)
app.use('/api/v2/auth', authRouter);
app.use('/api/v2/contacts', contactsRouter);
app.use('/api/v2/contacts/upload', uploadRouter);
// Backward-compat mounts — older frontend builds and the v1 SPA call /api/*
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/contacts/upload', uploadRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns', sendRouter);
app.use('/api/v2', v2Router);

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Frontend SPA (production build) ─────────────────────
const distDir = '/home/ubuntu/map-com-frontend/dist';
app.use(express.static(distDir));

// SPA catch-all — must be last
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// Ensure upload dirs on startup
fs.mkdirSync(path.join(uploadsDir, 'contacts'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'media'), { recursive: true });

// Resume any campaigns that were mid-send when the server stopped
resumeInterruptedCampaigns();

// v2 dispatcher: fire scheduled campaigns every 60s
setInterval(() => {
  v2Tick().catch((e) => console.error('[v2 tick]', e.message));
}, 60_000);

// WhatsApp assistant: lead follow-up tick every hour
setInterval(() => {
  tickFollowUps().catch((e) => console.error('[followups]', e.message));
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`WhatsApp Campaign API + Frontend running on port ${PORT}`);
});
