import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as XLSX from 'xlsx';
import fs from 'fs';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { toWhatsAppNumber } from '../utils/phone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads/contacts');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls|json)$/i)) cb(null, true);
    else cb(new Error('Excel or JSON files only (.xlsx, .xls, .json)'));
  },
});

const router = Router();
router.use(requireAuth);

// POST /api/contacts/upload — parse Excel or JSON and bulk-import contacts
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { groupName } = req.body;

  let rows = [];

  // Handle JSON files directly
  if (req.file.originalname.toLowerCase().endsWith('.json')) {
    try {
      const fileContent = fs.readFileSync(req.file.path, 'utf-8');
      rows = JSON.parse(fileContent);
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'JSON must be an array of contacts' });
      }
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Invalid JSON file' });
    }
  } else {
    // Handle Excel files
    let workbook;
    let fileBuf;
    try {
      fileBuf = fs.readFileSync(req.file.path);
      workbook = XLSX.read(fileBuf, { type: 'buffer' });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Could not read Excel file' });
    }

    const sheetName = workbook.SheetNames[0];
    // sheet_to_json without header:1 returns {col: val} objects keyed by column letter
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    // Detect header mode: first row must have named keys (not single-letter column refs)
    const isHeaderMode = rawRows.length > 0 &&
      rawRows[0] !== null &&
      typeof rawRows[0] === 'object' &&
      !Object.keys(rawRows[0]).every(k => /^[A-Z]+$/i.test(k));
    if (rawRows.length === 0 && sheetName) {
      // Empty sheet with no header — try reading raw cell values
      const ws = workbook.Sheets[sheetName];
      const ref = ws['!ref']; // e.g. "A1" or "A1:A10"
      if (ref) {
        const parts = ref.includes(':') ? ref.split(':') : [ref, ref];
        const startCell = parts[0];
        const endCell = parts[1] || startCell;
        const startRow = parseInt(startCell.replace(/[A-Z]/g, '')) || 1;
        const maxRow = parseInt(endCell.replace(/[A-Z]/g, '')) || startRow;
        rows = [];
        for (let r = startRow; r <= maxRow; r++) {
          const cell = ws['A' + r];
          if (cell && (cell.t === 'n' || cell.t === 's')) {
            rows.push({ phone: cell.t === 's' ? cell.v : String(cell.v) });
          }
        }
      }
    } else if (!isHeaderMode && rawRows.length > 0 && Object.keys(rawRows[0]).every(k => /^[A-Z]+$/i.test(k))) {
      // No header — column letters only; extract phone from the first column
      rows = rawRows.map(r => {
        const firstCol = r[Object.keys(r)[0]];
        return { phone: firstCol };
      });
    } else {
      rows = rawRows;
    }
  }

  // Case-insensitive phone column lookup — check multiple common headers.
  // Numbers are normalized to WhatsApp MSISDN at import time (06… → 212…).
  const getPhone = (row) => {
    const val =
      row.phone ||
      row.Phone ||
      row.PHONE ||
      row.mobile ||
      row.Mobile ||
      row.MOBILE ||
      row['رقم الهاتف'] ||
      '';
    return toWhatsAppNumber(val);
  };

  let imported = 0;
  let skipped = 0;

  const insert = db.prepare(
    'INSERT INTO contacts (user_id, name, phone, group_name) VALUES (?, ?, ?, ?)'
  );

  const importMany = db.transaction(() => {
    for (const row of rows) {
      const phone = getPhone(row);
      if (!phone || phone.length < 10) {
        skipped++;
        continue;
      }
      const name =
        row.name || row.Name || row.Nom || row['الاسم'] || row.Nom || '';
      insert.run(req.userId, name, phone, groupName || null);
      imported++;
    }
  });

  try {
    importMany(rows);
  } catch (e) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: e.message });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch {}
  }

  res.json({ imported, skipped, total: rows.length });
});

export default router;
