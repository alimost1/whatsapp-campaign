import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/contacts — list contacts for the authenticated user
router.get('/', (req, res) => {
  const { group } = req.query;
  let stmt;
  if (group) {
    stmt = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND group_name = ? ORDER BY id DESC');
    res.json(stmt.all(req.userId, group));
  } else {
    stmt = db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC');
    res.json(stmt.all(req.userId));
  }
});

// DELETE /api/contacts/:id — delete a contact (must belong to user)
router.delete('/:id', (req, res) => {
  const stmt = db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?');
  const result = stmt.run(req.params.id, req.userId);
  res.json({ deleted: result.changes });
});

// GET /api/contacts/groups — list distinct group_name values for this user
router.get('/groups', (req, res) => {
  const stmt = db.prepare(
    'SELECT DISTINCT group_name FROM contacts WHERE user_id = ? AND group_name IS NOT NULL ORDER BY group_name'
  );
  res.json(stmt.all(req.userId).map((r) => r.group_name));
});

export default router;