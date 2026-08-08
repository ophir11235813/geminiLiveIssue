import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db';
import { requireAuth, requireApproved, requireAdmin } from '../middleware/auth';
import { extractTextFromFile, UnsupportedFileTypeError } from '../lib/extractText';
import { getIngestInfo } from '../lib/emailIngest';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();
router.use(requireAuth, requireApproved);

// Tells the Documents page where to forward things and what word the
// subject needs to contain — lets that copy stay accurate without hardcoding
// the address in the frontend. Open to any approved user, not just admins:
// forwarding by email is the only way a regular user contributes at all.
router.get('/ingest-info', (_req, res) => {
  res.json({ ingest: getIngestInfo() });
});

// Everything else here — viewing, adding, editing, deleting documents — is
// admin-only. Regular users don't manage the knowledge base directly; their
// one path in is forwarding an email (see ingest-info above), which the
// backend ingestion pipeline turns into a document on its own.
router.use(requireAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.source_type, d.content, d.created_at,
              d.sender, d.sent_at, d.flagged, d.flag_reason,
              u.email AS uploader_email
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploader_id
       ORDER BY d.created_at DESC`
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { title, sourceType } = req.body || {};
    let content: string | undefined = req.body?.content;

    if (req.file) {
      try {
        content = await extractTextFromFile(req.file.buffer, req.file.mimetype);
      } catch (err) {
        if (err instanceof UnsupportedFileTypeError) {
          return res.status(400).json({ error: err.message });
        }
        // A supported type that failed while being processed (e.g. Claude
        // couldn't read the image) isn't the user's fault — worth a retry.
        console.error('File extraction failed', err);
        return res.status(502).json({ error: 'Could not process that file. Please try again.' });
      }
    }

    if (!title || !sourceType) {
      return res.status(400).json({ error: 'title and sourceType are required' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Provide file content or pasted text' });
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (uploader_id, title, source_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, source_type, content, created_at, sender, sent_at, flagged, flag_reason`,
      [req.user!.id, title, sourceType, content]
    );
    res.status(201).json({ document: { ...rows[0], uploader_email: req.user!.email } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, sourceType, content } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE documents SET
         title = COALESCE($1, title),
         source_type = COALESCE($2, source_type),
         content = COALESCE($3, content)
       WHERE id = $4
       RETURNING id, title, source_type, content, created_at`,
      [title ?? null, sourceType ?? null, content ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    res.json({ document: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
