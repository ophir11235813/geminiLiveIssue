import 'dotenv/config';
import dns from 'dns';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Railway's outbound network doesn't route IPv6 (seen in practice as
// ENETUNREACH connecting to Gmail's SMTP endpoint on its AAAA address) even
// though it happily hands one out via DNS. Preferring IPv4 results here
// avoids that dead end for every outbound connection this process makes —
// Gmail SMTP/IMAP, Anthropic, Resend, Postgres — not just the one that
// happened to surface it first.
dns.setDefaultResultOrder('ipv4first');

import { pool } from './db';
import { applyMigrations } from './lib/runMigrations';
import { startEmailIngestPolling } from './lib/emailIngest';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import documentsRoutes from './routes/documents';
import chatRoutes from './routes/chat';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Vercel mints a new deployment-specific URL (…-<hash>-<team>.vercel.app) on every
// deploy in addition to the stable production domain, so a single exact-match
// CLIENT_ORIGIN keeps drifting out of sync. Accept the configured origin plus any
// preview/deployment URL that belongs to this same Vercel project.
const CLIENT_ORIGIN_HOSTNAME = (() => {
  try {
    return new URL(CLIENT_ORIGIN).hostname;
  } catch {
    return undefined;
  }
})();
const projectSlug = CLIENT_ORIGIN_HOSTNAME?.split('.')[0]; // e.g. "gemini-live-issue"
const vercelPreviewPattern =
  projectSlug && CLIENT_ORIGIN_HOSTNAME?.endsWith('.vercel.app')
    ? new RegExp(`^https:\\/\\/${projectSlug}[a-z0-9-]*\\.vercel\\.app$`)
    : undefined;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // non-browser requests (curl, health checks)
      if (origin === CLIENT_ORIGIN || vercelPreviewPattern?.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
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
    console.log(`Springhill Cubby API listening on port ${PORT}`);
  });

  startEmailIngestPolling();
}

start();
