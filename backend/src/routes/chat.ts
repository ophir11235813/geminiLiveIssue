import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireApproved } from '../middleware/auth';
import { askClaude } from '../lib/claude';

const router = Router();
router.use(requireAuth, requireApproved);

// Rough character budget so we don't blow past the model's context window.
// No RAG/embeddings needed at this data volume — we just concatenate everything that fits.
const MAX_CONTEXT_CHARS = 150_000;
const MAX_TITLE_LENGTH = 50;

function titleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_TITLE_LENGTH ? `${trimmed.slice(0, MAX_TITLE_LENGTH)}…` : trimmed;
}

// List this user's chats, most recently active first.
router.get('/sessions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user!.id]
    );
    res.json({ sessions: rows });
  } catch (err) {
    next(err);
  }
});

// Messages for a single chat (ownership-checked).
router.get('/sessions/:id/messages', async (req, res, next) => {
  try {
    const { rows: sessionRows } = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (!sessionRows[0]) return res.status(404).json({ error: 'Chat not found' });

    const { rows } = await pool.query(
      'SELECT role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ messages: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/sessions/:id', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET title = $1 WHERE id = $2 AND user_id = $3
       RETURNING id, title, created_at, updated_at`,
      [String(title).trim().slice(0, 200), req.params.id, req.user!.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Chat not found' });
    res.json({ session: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Chat not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Send a message. Omitting sessionId creates a new chat on the fly (titled
// from the message itself), so there's never an empty chat cluttering the
// sidebar for a conversation that was never actually started.
router.post('/messages', async (req, res, next) => {
  try {
    const { message, sessionId } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // If an existing session was named, verify ownership up front — but don't
    // create a *new* one until we know the Claude call actually succeeds.
    // Otherwise a failed request (rate limit, network blip) leaves behind an
    // empty orphaned session the frontend never learns the ID of, and a
    // retry (which also omits sessionId, since the client never found out)
    // would create yet another one on top of it.
    if (sessionId) {
      const { rows } = await pool.query(
        'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, req.user!.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Chat not found' });
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

    let activeSessionId: string = sessionId;
    if (!activeSessionId) {
      const { rows } = await pool.query(
        'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id',
        [req.user!.id, titleFromMessage(message)]
      );
      activeSessionId = rows[0].id;
    }

    await pool.query(
      `INSERT INTO chat_messages (user_id, session_id, role, content)
       VALUES ($1, $2, 'user', $3), ($1, $2, 'assistant', $4)`,
      [req.user!.id, activeSessionId, message, reply]
    );
    await pool.query('UPDATE chat_sessions SET updated_at = now() WHERE id = $1', [activeSessionId]);

    res.json({ reply, sessionId: activeSessionId });
  } catch (err) {
    console.error('Chat error', err);
    res.status(502).json({ error: 'Failed to get a response from the assistant. Please try again.' });
  }
});

export default router;
