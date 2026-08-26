const db = require('./db.js').default;
const users = db.prepare('SELECT id, email FROM users').all();
console.log('Users:');
users.forEach(u => {
  console.log(u.id + ': ' + u.email);
});
