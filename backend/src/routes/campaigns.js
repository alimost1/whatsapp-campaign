import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import fs from 'fs';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN_MEDIA_DIR = path.join(__dirname, '../../uploads/campaigns');
fs.mkdirSync(CAMPAIGN_MEDIA_DIR, { recursive: true });

const upload = multer({
  dest: CAMPAIGN_MEDIA_DIR,
  limits: {
    files: 10,
    fileSize: 16 * 1024 * 1024, // 16 MB
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, Office documents, and text files
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const router = Router();
router.use(requireAuth);

// GET /api/campaigns — list campaigns for user, newest first
router.get('/', async (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM campaign_attachments ca WHERE ca.campaign_id = c.id) as attachment_count
      FROM campaigns c 
      WHERE c.user_id = ? 
      ORDER BY c.created_at DESC
    `).all(req.userId);

    // For each campaign, fetch attachments
    const campaignsWithAttachments = await Promise.all(
      campaigns.map(async (campaign) => {
        const attachments = db.prepare(`
          SELECT id, file_path, original_name, mime_type, size, created_at
          FROM campaign_attachments
          WHERE campaign_id = ?
          ORDER BY created_at
        `).all(campaign.id);
        return { ...campaign, attachments };
      })
    );

    res.json(campaignsWithAttachments);
  } catch (err) {
    console.error('Failed to list campaigns:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns — create a new campaign with attachments
router.post('/', upload.array('attachments', 10), async (req, res) => {
  const { name, message, status, scheduledAt, channel, instanceName } = req.body;
  if (!name) return res.status(400).json({ error: 'Campaign name is required' });

  let campaignId;
  try {
    // Start transaction
    db.transaction(() => {
      const campaignStmt = db.prepare(`
        INSERT INTO campaigns (user_id, name, message_text, contact_group, status, scheduledAt, channel, instanceName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const campaignResult = campaignStmt.run(
        req.userId,
        name,
        message || '',
        null, // contact_group (we don't have this in the frontend yet, but we can keep for compatibility)
        status || 'draft',
        scheduledAt || null,
        channel || 'evolution',
        instanceName || 'promo'
      );
      campaignId = campaignResult.lastInsertRowid;

      // Save attachments
      if (req.files && req.files.length > 0) {
        const attachmentStmt = db.prepare(`
          INSERT INTO campaign_attachments (campaign_id, file_path, original_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?)
        `);
        req.files.forEach((file) => {
          attachmentStmt.run(
            campaignId,
            file.path.replace(/^.*[\\/]/, ''), // Store only the filename
            file.originalname,
            file.mimetype,
            file.size
          );
        });
      }
    })();

    res.json({
      id: campaignId,
      name,
      status: status || 'draft',
      attachmentCount: req.files ? req.files.length : 0,
    });
  } catch (err) {
    console.error('Failed to create campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns/:id — get a single campaign (404 if not found or wrong user)
router.get('/:id', async (req, res) => {
  try {
    const campaign = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM campaign_attachments ca WHERE ca.campaign_id = c.id) as attachment_count
      FROM campaigns c 
      WHERE c.id = ? AND c.user_id = ?
    `).get(req.params.id, req.userId);

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const attachments = db.prepare(`
      SELECT id, file_path, original_name, mime_type, size, created_at
      FROM campaign_attachments
      WHERE campaign_id = ?
      ORDER BY created_at
    `).all(campaign.id);

    const send_logs = db.prepare(`
      SELECT * FROM send_logs WHERE campaign_id = ? ORDER BY id
    `).all(campaign.id);

    res.json({ ...campaign, attachments, send_logs });
  } catch (err) {
    console.error('Failed to get campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/campaigns/:id — update a campaign and replace attachments
router.put('/:id', upload.array('attachments', 10), async (req, res) => {
  if (!req.params.id) return res.status(400).json({ error: 'Campaign ID is required' });

  const { name, message, status, scheduledAt, channel, instanceName } = req.body;
  if (!name) return res.status(400).json({ error: 'Campaign name is required' });

  try {
    // Start transaction
    db.transaction(() => {
      // Update campaign
      const campaignStmt = db.prepare(`
        UPDATE campaigns 
        SET name = ?, 
            message_text = ?, 
            status = ?, 
            scheduledAt = ?, 
            channel = ?, 
            instanceName = ?
        WHERE id = ? AND user_id = ?
      `);
      const campaignResult = campaignStmt.run(
        name,
        message || '',
        status || 'draft',
        scheduledAt || null,
        channel || 'evolution',
        instanceName || 'promo',
        req.params.id,
        req.userId
      );

      if (campaignResult.changes === 0) {
        throw new Error('Campaign not found or not authorized');
      }

      // Remove existing attachments
      db.prepare('DELETE FROM campaign_attachments WHERE campaign_id = ?').run(req.params.id);

      // Save new attachments
      if (req.files && req.files.length > 0) {
        const attachmentStmt = db.prepare(`
          INSERT INTO campaign_attachments (campaign_id, file_path, original_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?)
        `);
        req.files.forEach((file) => {
          attachmentStmt.run(
            req.params.id,
            file.path.replace(/^.*[\\/]/, ''), // Store only the filename
            file.originalname,
            file.mimetype,
            file.size
          );
        });
      }
    })();

    res.json({ 
      id: req.params.id, 
      name, 
      status: status || 'draft',
      attachmentCount: req.files ? req.files.length : 0
    });
  } catch (err) {
    console.error('Failed to update campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/campaigns/:id — delete a campaign and its attachments
router.delete('/:id', async (req, res) => {
  try {
    // Start transaction
    db.transaction(() => {
      // Delete attachments (and thus delete files from disk)
      const attachments = db.prepare(`
        SELECT file_path FROM campaign_attachments WHERE campaign_id = ?
      `).all(req.params.id);

      // Delete files from disk
      attachments.forEach((attachment) => {
        const filePath = path.join(CAMPAIGN_MEDIA_DIR, attachment.file_path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      // Delete attachment records
      db.prepare('DELETE FROM campaign_attachments WHERE campaign_id = ?').run(req.params.id);

      // Delete campaign
      const result = db.prepare('DELETE FROM campaigns WHERE id = ? AND user_id = ?')
        .run(req.params.id, req.userId);

      if (result.changes === 0) {
        throw new Error('Campaign not found or not authorized');
      }
    })();

    res.json({ deleted: true });
  } catch (err) {
    console.error('Failed to delete campaign:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;