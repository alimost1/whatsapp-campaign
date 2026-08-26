const db = require('./db.js').default;
// Check campaigns table
const tableInfo = db.prepare('PRAGMA table_info(campaigns)').all();
console.log('Campaigns table columns:');
tableInfo.forEach(col => {
  console.log(`${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PK' : ''}`);
});
