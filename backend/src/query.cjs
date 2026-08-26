const db = require('./db.js').default;
console.log('DB module loaded:', typeof db);
// Query for users
const users = db.prepare('SELECT id, email, name FROM users').all();
console.log('Users:', users);
// Query for contacts count
const contactsCount = db.prepare('SELECT COUNT(*) FROM contacts').get();
console.log('Contacts count:', contactsCount['COUNT(*)']);
// Query for campaigns count
const campaignsCount = db.prepare('SELECT COUNT(*) FROM campaigns').get();
console.log('Campaigns count:', campaignsCount['COUNT(*)']);
// Query for campaign attachments count
const attachmentsCount = db.prepare('SELECT COUNT(*) FROM campaign_attachments').get();
console.log('Campaign attachments count:', attachmentsCount['COUNT(*)']);
// Query for send logs count
const sendLogsCount = db.prepare('SELECT COUNT(*) FROM send_logs').get();
console.log('Send logs count:', sendLogsCount['COUNT(*)']);
// Get stats for the dashboard (assuming user_id=1 for now)
const stats = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM contacts WHERE user_id = 1) as contacts,
    (SELECT COUNT(*) FROM contacts WHERE user_id = 1 AND DATE(created_at) = DATE('now')) as todayContacts,
    COALESCE(SUM(sent_count), 0) as messagesSent,
    COALESCE(SUM(failed_count), 0) as failedCount
  FROM campaigns 
  WHERE user_id = 1
`).get();
console.log('Dashboard stats (user_id=1):', stats);
// Also get a sample of recent campaigns for the dashboard
const recentCampaigns = db.prepare(`
  SELECT c.id, c.name, c.status, c.sent_count, c.failed_count, c.created_at,
         (SELECT COUNT(*) FROM campaign_attachments ca WHERE ca.campaign_id = c.id) as attachment_count
  FROM campaigns c
  WHERE c.user_id = 1
  ORDER BY c.created_at DESC
  LIMIT 5
`).all();
console.log('Recent campaigns (user_id=1):', recentCampaigns);
