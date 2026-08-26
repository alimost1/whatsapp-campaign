import db from './src/db.js';
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@map-com.com');
console.log('User:', user);
if (user) {
  console.log('User ID:', user.id);
  console.log('Email:', user.email);
  console.log('Name:', user.name);
  console.log('Has password_hash:', !!user.password_hash);
} else {
  console.log('No user found with email admin@map-com.com');
}