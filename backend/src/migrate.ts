import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '0001_init.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Migrations applied successfully');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
