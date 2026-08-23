import bcrypt from 'bcrypt';
import db from './src/db.js';

async function updatePassword() {
  const newHash = await bcrypt.hash('newpassword123', 10);
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(newHash, 'admin@map-com.com');
  console.log('Updated rows:', result.changes);
}

updatePassword();
