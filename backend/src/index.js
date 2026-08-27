import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Load environment variables from backend/.env FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

// Fail fast if JWT_SECRET is not configured
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in backend/.env');
}

import authRouter from './routes/auth.js';
import contactsRouter from './routes/contacts.js';
import uploadRouter from './routes/upload.js';
import campaignsRouter from './routes/campaigns.js';
import sendRouter from './routes/send.js';
import v2Router from './routes/v2.js';
import gmailRouter from './routes/gmail.js';
import statsRouter from './routes/stats.js';
import { resumeInterruptedCampaigns } from './services/campaignWorker.js';
import { tick as v2Tick } from './services/v2Dispatcher.js';
import { tickFollowUps } from './services/whatsappAssistant.js';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = ['https://map-com.executioneveryday.com', 'http://localhost:5173'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    if (!origin || allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin || '*');
      res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
      res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.set('Access-Control-Allow-Credentials', 'true');
      return res.status(204).end();
    }
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// API routes - v2 (new features)
app.use('/api/v2/auth', authRouter);
app.use('/api/v2/contacts', contactsRouter);
app.use('/api/v2/contacts/upload', uploadRouter);
app.use('/api/v2/gmail', gmailRouter);
app.use('/api/v2', v2Router);

// API routes - v1 (compatibility)
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/contacts/upload', uploadRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns', sendRouter);
app.use('/api/stats', statsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Serve React frontend build
const distDir = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distDir));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't intercept API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// Ensure upload directories exist
fs.mkdirSync(path.join(uploadsDir, 'contacts'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'campaigns'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'media'), { recursive: true });

// Resume interrupted campaigns on startup
resumeInterruptedCampaigns();

// Start background workers
setInterval(() => v2Tick().catch((e) => console.error('[v2 tick]', e.message)), 60_000);
setInterval(() => tickFollowUps().catch((e) => console.error('[followups]', e.message)), 60 * 60 * 1000);

app.listen(PORT, () => console.log(`WhatsApp Campaign API + Frontend running on port ${PORT}`));