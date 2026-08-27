import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '../campaign.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = on');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    group_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    message_text TEXT,
    contact_group TEXT,
    status TEXT DEFAULT 'draft',
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    instance_name TEXT,
    scheduledAt DATETIME,
    channel TEXT DEFAULT 'evolution',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS campaign_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS send_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER,
    phone TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
  );
`);

// Safe migrations — SQLite has no built-in migration runner, so check before altering
const campaignCols = db.prepare("PRAGMA table_info(campaigns)").all();
const hasInstanceName = campaignCols.some((c) => c.name === 'instance_name');
if (!hasInstanceName) {
  db.exec('ALTER TABLE campaigns ADD COLUMN instance_name TEXT');
}

const hasScheduledAt = campaignCols.some((c) => c.name === 'scheduledAt');
if (!hasScheduledAt) {
  db.exec('ALTER TABLE campaigns ADD COLUMN scheduledAt DATETIME');
}

const hasChannel = campaignCols.some((c) => c.name === 'channel');
if (!hasChannel) {
  db.exec('ALTER TABLE campaigns ADD COLUMN channel TEXT DEFAULT \'evolution\'');
}

// Check if image_path column exists (legacy) and drop it
const hasImagePath = campaignCols.some((c) => c.name === 'image_path');
if (hasImagePath) {
  db.exec('ALTER TABLE campaigns DROP COLUMN image_path');
}

// Check if campaign_attachments table exists, if not create it
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_attachments'").all();
if (tables.length === 0) {
  db.exec(`
    CREATE TABLE campaign_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
  `);
}

// Indexes for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
  CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
  CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
  CREATE INDEX IF NOT EXISTS idx_send_logs_campaign_id ON send_logs(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_campaign_attachments_campaign_id ON campaign_attachments(campaign_id);
`);

export default db;