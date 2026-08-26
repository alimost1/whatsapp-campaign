import db from './src/db.js';
import bcrypt from 'bcrypt';

const password = 'app123';
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Bcrypt hash error:', err);
    process.exit(1);
  }
  console.log('Hash for \"app123\":', hash);
  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?');
  const info = stmt.run(hash, 'admin@map-com.com');
  console.log('Update result:', info.changes ? 'Updated' : 'No rows updated');
});