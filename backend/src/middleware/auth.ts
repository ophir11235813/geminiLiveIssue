import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { AuthUser } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.session;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const { rows } = await pool.query<AuthUser>(
      'SELECT id, email, status, role FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

export function requireApproved(req: Request, res: Response, next: NextFunction) {
  if (req.user?.status !== 'approved') {
    return res.status(403).json({ error: 'Account not approved yet', status: req.user?.status });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
