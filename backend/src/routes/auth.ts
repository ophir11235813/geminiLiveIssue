import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { signToken, requireAuth } from '../middleware/auth';

const router = Router();
const COOKIE_NAME = 'session';
const isProd = process.env.NODE_ENV === 'production';

const cookieOpts = {
  httpOnly: true,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  secure: isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // The very first user to sign up becomes an approved admin so there's
    // always someone who can approve everyone else. Everyone after starts pending.
    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const isFirstUser = countRows[0].count === 0;

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, status, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, status, role`,
      [normalizedEmail, passwordHash, isFirstUser ? 'approved' : 'pending', isFirstUser ? 'admin' : 'user']
    );
    const user = rows[0];

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, status, role FROM users WHERE email = $1',
      [normalizedEmail]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    res.json({ user: { id: user.id, email: user.email, status: user.status, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
