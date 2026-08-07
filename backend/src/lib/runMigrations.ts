import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Idempotent — every statement in the migration file uses IF NOT EXISTS,
// so this is safe to run on every boot, not just once.
export async function applyMigrations(pool: Pool): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '0001_init.sql'), 'utf-8');
  await pool.query(sql);
}
