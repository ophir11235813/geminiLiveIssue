import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { sendApprovalEmail, sendRevokeEmail } from '../lib/email';

const router = Router();
router.use(requireAuth, requireAdmin);

const VALID_STATUSES = new Set(['pending', 'approved', 'revoked']);

router.get('/users', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const params: string[] = [];
    let query = 'SELECT id, email, status, role, created_at FROM users';
    if (status && VALID_STATUSES.has(status)) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/approve', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET status = 'approved' WHERE id = $1 RETURNING id, email, status, role`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    sendApprovalEmail(rows[0].email).catch(() => {});
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/revoke', async (req, res, next) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ error: "You can't revoke your own access" });
    }
    const { rows } = await pool.query(
      `UPDATE users SET status = 'revoked' WHERE id = $1 RETURNING id, email, status, role`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    sendRevokeEmail(rows[0].email).catch(() => {});
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
