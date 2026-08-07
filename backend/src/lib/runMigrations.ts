import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Every statement in every migration file uses IF NOT EXISTS / ADD COLUMN IF
// NOT EXISTS, so running all of them on every boot (not just once) is safe —
// that's what lets a freshly provisioned database (or one that just needs a
// newer file it hasn't seen yet) get caught up automatically. Files are
// applied in filename order, so new migrations should sort after old ones
// (0001_, 0002_, ...).
export async function applyMigrations(pool: Pool): Promise<void> {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    await pool.query(sql);
  }
}
