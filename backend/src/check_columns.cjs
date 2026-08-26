const db = require('./db.js').default;
console.log('Database object:', db);
// Check campaigns table
try {
  const tableInfo = db.prepare('PRAGMA table_info(campaigns)').all();
  console.log('Campaigns table columns:');
  tableInfo.forEach(col => {
    console.log(`${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PK' : ''}`);
  });
} catch (e) {
  console.log('Error getting table info:', e);
}
