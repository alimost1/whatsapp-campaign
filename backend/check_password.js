import db from './src/db.js';
import bcrypt from 'bcrypt';

const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@map-com.com');
if (!user) {
  console.log('User not found');
  process.exit(1);
}

const password = 'app123'; // the password we are trying
bcrypt.compare(password, user.password_hash, (err, result) => {
  if (err) {
    console.error('Bcrypt error:', err);
    process.exit(1);
  }
  console.log('Password match:', result);
});