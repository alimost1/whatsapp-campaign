/**
 * Create or update the admin user (idempotent upsert).
 *
 * Usage:
 *   npm run create-admin
 *   ADMIN_EMAIL=admin@map-com.com ADMIN_PASSWORD='S3cure!' ADMIN_NAME='Admin' npm run create-admin
 *   node scripts/create-admin.mjs admin@map-com.com 'S3cure!' 'Admin'
 *
 * Priority: CLI args > env vars > defaults.
 * Writes to the DB configured by DB_PATH (default: backend/campaign.db).
 */
import bcrypt from 'bcrypt';
import db from '../src/db.js';

const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@map-com.com';
const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';
const name = process.argv[4] || process.env.ADMIN_NAME || 'Admin';

if (!password) {
  console.error('Error: no password provided.');
  console.error("Usage: node scripts/create-admin.mjs <email> <password> [name]");
  console.error('   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin');
  process.exit(1);
}

if (String(password).length < 8) {
  console.error('Error: password must be at least 8 characters.');
  process.exit(1);
}

const hash = await bcrypt.hash(String(password), 10);

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, name = ? WHERE email = ?').run(hash, name, email);
  console.log(`Updated existing user ${email} (id ${existing.id})`);
} else {
  const result = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(email, hash, name);
  console.log(`Created user ${email} (id ${result.lastInsertRowid})`);
}

const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
console.log(`Users in database: ${total}`);
process.exit(0);
