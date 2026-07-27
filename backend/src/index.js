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
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
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
import { resumeInterruptedCampaigns } from './services/campaignWorker.js';

app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/contacts/upload', uploadRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns', sendRouter);

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Frontend SPA (production build) ─────────────────────
const distDir = path.join(__dirname, '../../frontend/dist');
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

app.listen(PORT, () => {
  console.log(`WhatsApp Campaign API + Frontend running on port ${PORT}`);
});