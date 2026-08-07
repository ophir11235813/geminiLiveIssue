import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireApproved } from '../middleware/auth';
import { askClaude } from '../lib/claude';

const router = Router();
router.use(requireAuth, requireApproved);

// Rough character budget so we don't blow past the model's context window.
// No RAG/embeddings needed at this data volume — we just concatenate everything that fits.
const MAX_CONTEXT_CHARS = 150_000;

router.post('/', async (req, res, next) => {
  try {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const { rows: docs } = await pool.query(
      'SELECT title, source_type, content, created_at FROM documents ORDER BY created_at DESC'
    );

    let contextText = '';
    for (const doc of docs) {
      const chunk = `\n\n### ${doc.title} (${doc.source_type}, added ${new Date(
        doc.created_at
      ).toLocaleDateString()})\n${doc.content}`;
      if (contextText.length + chunk.length > MAX_CONTEXT_CHARS) break;
      contextText += chunk;
    }

    const reply = await askClaude(message, contextText);

    await pool.query(
      `INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [req.user!.id, message, reply]
    );

    res.json({ reply });
  } catch (err) {
    console.error('Chat error', err);
    res.status(502).json({ error: 'Failed to get a response from the assistant. Please try again.' });
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 200',
      [req.user!.id]
    );
    res.json({ messages: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
