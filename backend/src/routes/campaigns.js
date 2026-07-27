import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import fs from 'fs';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dirname, '../../uploads/media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const upload = multer({
  dest: MEDIA_DIR,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

const router = Router();
router.use(requireAuth);

// GET /api/campaigns — list campaigns for user, newest first
router.get('/', (req, res) => {
  const stmt = db.prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC');
  res.json(stmt.all(req.userId));
});

// POST /api/campaigns — create a new campaign
router.post('/', upload.single('image'), (req, res) => {
  const { name, message_text, contact_group } = req.body;
  if (!name) return res.status(400).json({ error: 'Campaign name is required' });

  // If an image was uploaded, persist it now and store the public path
  let imagePath = null;
  if (req.file) {
    imagePath = `/uploads/media/${req.file.filename}`;
  }

  const stmt = db.prepare(
    'INSERT INTO campaigns (user_id, name, message_text, contact_group, image_path) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    req.userId,
    name,
    message_text || '',
    contact_group || null,
    imagePath
  );
  res.json({
    id: result.lastInsertRowid,
    name,
    status: 'draft',
    image_path: imagePath,
  });
});

// GET /api/campaigns/:id — get a single campaign (404 if not found or wrong user)
router.get('/:id', (req, res) => {
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

// POST /api/campaigns/:id/image — upload an image for the campaign
router.post('/:id/image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file' });

  // Verify campaign belongs to user
  const campaign = db
    .prepare('SELECT id FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const imagePath = `/uploads/media/${req.file.filename}`;
  db.prepare('UPDATE campaigns SET image_path = ? WHERE id = ?')
    .run(imagePath, req.params.id);
  res.json({ imagePath });
});

// DELETE /api/campaigns/:id — delete a campaign
router.delete('/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM campaigns WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  res.json({ deleted: result.changes });
});

export default router;