import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { pool } from './db';
import { applyMigrations } from './lib/runMigrations';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import documentsRoutes from './routes/documents';
import chatRoutes from './routes/chat';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/documents', documentsRoutes);
app.use('/chat', chatRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    // Runs on every boot. Idempotent, so this is what keeps a freshly
    // provisioned database (or a schema change in a future deploy) in sync
    // without requiring a separate manual migration step.
    await applyMigrations(pool);
    console.log('Database schema is up to date');
  } catch (err) {
    console.error('Failed to apply database migrations', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Family Context Bot API listening on port ${PORT}`);
  });
}

start();
