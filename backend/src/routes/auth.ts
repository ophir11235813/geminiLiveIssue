import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { adminEmailsConfigured, isConfiguredAdminEmail } from '../lib/adminEmails';
import { sendPasswordResetEmail } from '../lib/email';

const router = Router();
const COOKIE_NAME = 'session';
const isProd = process.env.NODE_ENV === 'production';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
// A shared secret that proves someone signing up actually belongs to the
// group, before they even reach the "pending admin approval" stage. Unset
// means the gate is off (local dev doesn't need it configured).
const SIGNUP_PASSPHRASE = process.env.SIGNUP_PASSPHRASE;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const cookieOpts = {
  httpOnly: true,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  secure: isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, passphrase } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    // Checked before touching the database at all — no reason to leak
    // whether an email is already registered to someone who doesn't even
    // have the passphrase.
    if (SIGNUP_PASSPHRASE && String(passphrase || '').trim() !== SIGNUP_PASSPHRASE) {
      return res.status(403).json({ error: 'Incorrect passphrase' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Admin status is decided by the ADMIN_EMAILS allowlist. As a zero-config
    // fallback for a brand-new deployment where that hasn't been set up yet,
    // the very first person to sign up becomes an approved admin instead —
    // but once ADMIN_EMAILS is configured, it's the sole source of truth.
    let shouldBeAdmin: boolean;
    if (adminEmailsConfigured()) {
      shouldBeAdmin = isConfiguredAdminEmail(normalizedEmail);
    } else {
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
      shouldBeAdmin = countRows[0].count === 0;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, status, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, status, role`,
      [normalizedEmail, passwordHash, shouldBeAdmin ? 'approved' : 'pending', shouldBeAdmin ? 'admin' : 'user']
    );
    const user = rows[0];

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    res.status(201).json({ user, token });
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

    // ADMIN_EMAILS is a safety net, not the source of truth — admins are
    // otherwise managed entirely in the database via the Admin page's
    // promote/demote buttons, with no redeploy required. So this only ever
    // *grants* admin on login (and auto-approves on grant); it never
    // demotes someone who isn't on the list, which would otherwise silently
    // undo an in-app promotion the next time that person logged in.
    if (adminEmailsConfigured() && isConfiguredAdminEmail(user.email) && user.role !== 'admin') {
      await pool.query(`UPDATE users SET role = 'admin', status = 'approved' WHERE id = $1`, [user.id]);
      user.role = 'admin';
      user.status = 'approved';
    }

    const token = signToken(user.id);
    res.cookie(COOKIE_NAME, token, cookieOpts);
    res.json({ user: { id: user.id, email: user.email, status: user.status, role: user.role }, token });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    const user = rows[0];

    // Always the same response whether or not the account exists — otherwise
    // this endpoint becomes a way to check who's registered.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await pool.query('UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3', [
        hashToken(rawToken),
        expiresAt,
        user.id,
      ]);
      const resetLink = `${APP_URL}/reset-password?token=${rawToken}`;
      sendPasswordResetEmail(normalizedEmail, resetLink).catch(() => {});
    }

    res.json({ ok: true, message: "If that email has an account, we've sent a reset link." });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { rows } = await pool.query(
      `SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > now()`,
      [hashToken(String(token))]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ ok: true });
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
