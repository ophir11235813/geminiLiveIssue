import 'dotenv/config';
import { pool } from './db';
import { applyMigrations } from './lib/runMigrations';

// Standalone entry point (`npm run migrate`) for running migrations manually,
// e.g. from a local machine. Not required in normal operation — the server
// applies migrations automatically on boot (see index.ts).
async function main() {
  await applyMigrations(pool);
  console.log('Migrations applied successfully');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
