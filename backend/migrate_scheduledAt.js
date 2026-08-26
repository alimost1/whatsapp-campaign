import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../campaign.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = on');

const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
console.log('Columns:', tableInfo.map(c => c.name));
const hasScheduledAt = tableInfo.some((col) => col.name === 'scheduledAt');
console.log('Has scheduledAt?', hasScheduledAt);
if (!hasScheduledAt) {
  console.log('Adding scheduledAt column...');
  db.exec('ALTER TABLE campaigns ADD COLUMN scheduledAt DATETIME');
  console.log('Column added.');
} else {
  console.log('Column already exists.');
}

// Also check for instance_name
const campaignCols = db.prepare("PRAGMA table_info(campaigns)").all();
const hasInstanceName = campaignCols.some((c) => c.name === 'instance_name');
console.log('Has instance_name?', hasInstanceName);
if (!hasInstanceName) {
  console.log('Adding instance_name column...');
  db.exec('ALTER TABLE campaigns ADD COLUMN instance_name TEXT');
  console.log('Column added.');
} else {
  console.log('Column already exists.');
}