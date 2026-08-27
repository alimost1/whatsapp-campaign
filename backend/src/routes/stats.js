import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats — get dashboard stats
router.get('/', async (req, res) => {
  try {
    // Total contacts
    const contactsResult = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE user_id = ?').get(req.userId);
    
    // Today's contacts
    const todayContactsResult = db.prepare(`
      SELECT COUNT(*) as count FROM contacts 
      WHERE user_id = ? AND date(created_at) = date('now')
    `).get(req.userId);

    // Campaigns
    const campaignsResult = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE user_id = ?').get(req.userId);

    // Messages sent
    const sentResult = db.prepare(`
      SELECT SUM(sent_count) as total FROM campaigns WHERE user_id = ?
    `).get(req.userId);

    // Failed messages
    const failedResult = db.prepare(`
      SELECT SUM(failed_count) as total FROM campaigns WHERE user_id = ?
    `).get(req.userId);

    const totalSent = sentResult.total || 0;
    const totalFailed = failedResult.total || 0;
    const totalMessages = totalSent + totalFailed;
    const deliveryRate = totalMessages > 0 ? Math.round((totalSent / totalMessages) * 100) : 0;

    res.json({
      contacts: contactsResult.count || 0,
      todayContacts: todayContactsResult.count || 0,
      campaigns: campaignsResult.count || 0,
      messagesSent: totalSent,
      failedMessages: totalFailed,
      deliveryRate
    });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;