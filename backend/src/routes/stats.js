import { Router } from 'express';
import { requireAuth } from '../auth.js';
import db from '../db.js';

const router = Router();
router.use(requireAuth);

// GET /api/stats — get dashboard stats for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;

    // Get stats in a single query for efficiency
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM contacts WHERE user_id = ?) as contacts,
        (SELECT COUNT(*) FROM contacts WHERE user_id = ? AND DATE(created_at) = DATE('now')) as todayContacts,
        COALESCE(SUM(sent_count), 0) as messagesSent,
        COALESCE(SUM(failed_count), 0) as failedCount
      FROM campaigns 
      WHERE user_id = ?
    `).get(userId, userId, userId);

    const deliveryRate = (stats.messagesSent + stats.failedCount) > 0 
      ? (stats.messagesSent / (stats.messagesSent + stats.failedCount)) * 100 
      : 0;

    res.json({
      contacts: stats.contacts,
      todayContacts: stats.todayContacts,
      messagesSent: stats.messagesSent,
      deliveryRate: Number(deliveryRate.toFixed(2))
    });
  } catch (err) {
    console.error('Failed to get stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;