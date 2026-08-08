# Springhill Sherpa

A private, invite-only web app for a family/school group. An admin approves who gets in; approved
members upload context (WhatsApp exports, forwarded emails, flyers) and ask a chatbot questions
about it. No vector DB — the context is small enough to hand to Claude directly.

Implements the spec in full: approval-gated auth, document upload/management, a chat interface
backed by the Claude API, an admin dashboard, and approval/revoke emails.

## Stack

| Layer    | Choice                                             |
| -------- | --------------------------------------------------- |
| Frontend | React + TypeScript + Vite (`/frontend`)              |
| Backend  | Node.js + TypeScript + Express (`/backend`)          |
| Database | PostgreSQL                                          |
| Auth     | Roll-your-own — email/password + JWT bearer token          |
| LLM      | Claude API (`@anthropic-ai/sdk`)                     |
| Email    | [Resend](https://resend.com)                         |

### Decisions made on the spec's open questions

- **Email provider: Gmail SMTP (via a dedicated account), Resend as a fallback.** Resend was the
  original pick, but its sandbox sender can only deliver to the Resend account's own address
  without a verified domain — a real wall for a deployment with no domain. Sending through a
  dedicated Gmail account's own SMTP (an App Password, not the real account password) sidesteps
  that entirely and doubles as the account used for email-to-context ingestion below. If neither
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` nor `RESEND_API_KEY` are set, emails are just logged to the
  console — the app still works without either configured (handy for local dev).
- **Backend hosting: a standalone Express server**, not Vercel serverless functions. It needs a
  persistent Postgres connection pool and file uploads (multer), which fit a normal long-running
  server better than serverless. A `Dockerfile` is included so it can go on Railway, Render, Fly,
  or similar. The frontend still deploys to Vercel as originally specified.
- **Auth: roll-your-own** (bcrypt + JWT), not Clerk. Clerk is a fine choice too, but it pulls in an
  external account system for what's a small, single-tenant, invite-only app — plain
  email/password with an approval gate is simpler to reason about and self-contained.
- **Admin identity lives in the database (`role` column), managed from the Admin page** —
  promote/demote buttons next to each user, no redeploy or env var edit needed to add an admin
  later. `ADMIN_EMAILS` (comma-separated env var) exists alongside this as a safety net, not the
  primary mechanism: it only ever *grants* admin (on signup, or on next login for an existing
  account) and auto-approves when it does; it never revokes admin from someone who isn't on the
  list, so it can't fight with an in-app promotion. Demoting via the Admin page never touches
  approval status, only the role, and an admin can't demote themselves (so there's always at least
  one left). If `ADMIN_EMAILS` is left unset entirely, the very first person to sign up becomes
  admin instead, purely as a zero-config bootstrap for a brand-new deployment.
- **Auth token delivery: a bearer token in `localStorage`, not just a session cookie.** The
  frontend (Vercel) and backend (Railway/etc.) live on different domains, and Safari/iOS blocks
  cross-site cookies outright (ITP) even with `SameSite=None; Secure` set correctly. Login/signup
  return the JWT in the response body; the frontend stores it and sends it as `Authorization:
  Bearer <token>` on every request. A cookie is still set too, as a same-origin convenience for
  local dev, but the header is what actually carries auth once deployed.

## Project layout

```
backend/    Express + TypeScript API, Postgres access, Claude + email integration
frontend/   React + TypeScript + Vite SPA
```

## Local setup

### 1. Database

Create a Postgres database (locally, or a free one on Supabase/Neon/Railway), then:

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL (and PGSSL=require if it's a hosted DB), JWT_SECRET, ANTHROPIC_API_KEY
npm install
```

### 2. Backend

```bash
cd backend
npm run dev        # http://localhost:4000
```

The server applies database migrations automatically on every boot (they're idempotent, so this
is safe on every restart/redeploy) — there's no separate manual migration step, which matters if
you're deploying straight from a host like Railway without ever running anything locally. If you
do want to run migrations by hand for some reason (e.g. against a DB the server isn't pointed at
yet), `npm run migrate` still works standalone.

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:4000
npm install
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173`, sign up with an email listed in `ADMIN_EMAILS` (or, if you haven't
set that yet, whichever email you use first) — that account becomes admin and is immediately
approved. Anyone else lands on a "waiting for approval" screen until the admin approves them from
`/admin`.

## Environment variables

**backend/.env**

| Var                | Required | Notes                                                       |
| ------------------ | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`     | yes      | Postgres connection string                                   |
| `PGSSL`            | no       | `require` for hosted Postgres, `disable` for local (default) |
| `JWT_SECRET`       | yes      | Long random string (`openssl rand -hex 32`)                  |
| `ADMIN_EMAILS`     | no       | Comma-separated emails auto-granted admin (safety net, not the main path — see above). Unset → first signup becomes admin instead |
| `ANTHROPIC_API_KEY`| yes      | Claude API key                                                |
| `CLAUDE_MODEL`     | no       | Defaults to `claude-sonnet-5`                                 |
| `SCHOOL_CONTEXT`   | no       | One line of fixed context given to the model on every question (defaults to the Springhill Elementary / Hideout description) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | no | A dedicated Gmail account (App Password, not the real password) used for both outbound email and email-to-context ingestion (see below). Both unset → outbound falls back to Resend/console, ingestion is disabled |
| `GMAIL_INGEST_POLL_MINUTES` | no | How often to check that inbox for forwarded context. Defaults to 5 |
| `GMAIL_INGEST_SUBJECT_FILTER` | no | Only unread mail whose subject contains this (case-insensitive) gets ingested; everything else in the inbox is left untouched. Defaults to `context` |
| `RESEND_API_KEY`   | no       | Fallback outbound sender if `GMAIL_USER` isn't set. Omit both to just log emails to the console |
| `FROM_EMAIL`       | no       | Sender address when using the Resend fallback                 |
| `CLIENT_ORIGIN`    | yes      | Frontend origin, for CORS + cookies                            |
| `APP_URL`          | no       | Frontend URL used in email copy                                |
| `PORT`             | no       | Defaults to 4000                                                |

**frontend/.env**

| Var             | Required | Notes                       |
| ---------------- | -------- | ---------------------------- |
| `VITE_API_URL`   | yes      | Base URL of the backend API   |

## Deployment

- **Frontend → Vercel:** import the repo, set the project root to `frontend`, framework preset
  "Vite", and add `VITE_API_URL` pointing at your deployed backend.
- **Backend → any Node host (Railway/Render/Fly/etc.):** build with the included `Dockerfile`, or
  run `npm run build && npm start` — the database schema is created/updated automatically on boot,
  so no separate migration step is needed. Set all the backend env vars above, with
  `NODE_ENV=production` so auth cookies are issued with `Secure; SameSite=None` for cross-origin
  use from the Vercel frontend. **Monorepo note:** when connecting the repo to your host, set the
  service's root/source directory to `backend` (and `frontend` for the separate Vercel project) —
  otherwise the build won't find the app.

## API summary

| Endpoint                         | Auth            | Description                          |
| --------------------------------- | ---------------- | -------------------------------------- |
| `POST /auth/signup`               | —                 | Create account (pending, unless first user) |
| `POST /auth/login`                | —                 | Log in                                 |
| `POST /auth/logout`               | —                 | Clear session                          |
| `GET /auth/me`                    | any               | Current user                           |
| `GET /admin/users?status=`        | admin             | List users by status                   |
| `POST /admin/users/:id/approve`   | admin             | Approve (or re-approve) a user, emails them |
| `POST /admin/users/:id/revoke`    | admin             | Revoke a user, emails them             |
| `POST /admin/users/:id/promote`   | admin             | Grant admin (also auto-approves)       |
| `POST /admin/users/:id/demote`    | admin             | Remove admin (can't demote yourself)   |
| `GET /documents`                  | approved          | List all documents                     |
| `POST /documents`                 | approved          | Add a document (paste JSON or multipart file) |
| `PATCH /documents/:id`            | admin or uploader | Edit title/source type/content         |
| `DELETE /documents/:id`           | admin or uploader | Delete a document                      |
| `GET /chat/sessions`               | approved          | List this user's chats, most recently active first |
| `POST /chat/messages`              | approved          | Ask a question in a chat (creates a new chat if `sessionId` omitted), get a Claude-generated answer grounded in all documents |
| `GET /chat/sessions/:id/messages`  | approved (owner)  | Full message history for one chat      |
| `PATCH /chat/sessions/:id`         | approved (owner)  | Rename a chat                          |
| `DELETE /chat/sessions/:id`        | approved (owner)  | Delete a chat and its messages         |

## Data model

- **users** — `id`, `email`, `password_hash`, `status` (`pending`/`approved`/`revoked`), `role`
  (`admin`/`user`), `created_at`
- **documents** — `id`, `uploader_id`, `title`, `source_type`, `content`, `created_at`
- **chat_sessions** — `id`, `user_id`, `title`, `created_at`, `updated_at`. One row per
  conversation — a user can have many.
- **chat_messages** — `id`, `user_id`, `session_id`, `role` (`user`/`assistant`), `content`,
  `created_at`. Belongs to a `chat_sessions` row.

## Chat context, caching, and images

- No vector DB — every chat request concatenates all documents (capped at ~150k characters) and
  sends them straight to Claude as context. Fine at small scale; if the corpus grows a lot, add
  keyword filtering before that call.
- **Real conversation threading** — each chat sends its *full* prior message history to Claude
  (capped at the last 40 turns as a safety bound; the full chat is still stored/shown regardless),
  not just the newest question in isolation, so follow-ups like "what did I just ask?" work.
- **Prompt caching** — both the document context and the growing conversation history use
  `cache_control: { type: 'ephemeral' }`, so each new message in a chat reuses the cached prefix
  from the previous request instead of reprocessing everything from scratch every turn.
- **System prompt** carries fixed context that this is for a family whose kids attend Springhill
  Elementary (Lafayette, CA) and Hideout (an after-school program) — overridable via the
  `SCHOOL_CONTEXT` env var without a code change.
- **Images are supported** — uploading a `.jpg`/`.png`/`.gif`/`.webp` sends it to Claude's vision
  once at upload time; the returned transcription/description is stored as the document's text
  content, and the image bytes themselves are discarded (never stored). `.txt` and `.pdf` uploads
  are still extracted directly, no LLM call needed for those.

## Gmail: outbound email + email-to-context ingestion (optional)

One **dedicated** Gmail account (not a personal inbox) can handle both directions, via
`GMAIL_USER` / `GMAIL_APP_PASSWORD`:

- **Outbound** — approval/revoke emails send through that account's own SMTP (`lib/email.ts`),
  which works for any recipient with no domain to verify (unlike Resend's sandbox sender). Falls
  back to Resend (`RESEND_API_KEY`) if set instead, or to console logging if neither is configured.
- **Inbound (ingestion)** — the backend polls that same inbox via IMAP (every
  `GMAIL_INGEST_POLL_MINUTES`, default 5) for unread mail whose subject contains
  `GMAIL_INGEST_SUBJECT_FILTER` (default `context`, case-insensitive) — so put "context" (or
  whatever you've set it to) somewhere in the subject when forwarding, and everything else that
  lands in that inbox is left completely alone. Matches get saved as a document — source
  type `Email`, title from the subject, body as the content, image attachments run through the
  same vision extraction as a manual image upload. Processed messages are marked read so they
  aren't re-ingested. These documents show up with uploader "Auto-imported" since there's no
  signed-in app user in the loop, but any admin can still edit or delete them from the Documents
  page like any other.

Setup: create the dedicated Gmail account, turn on 2-Step Verification, generate an **App
Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (a
regular Gmail password won't work for either direction), and set the two env vars. Leave both
unset to disable both features — nothing else about the app depends on either.

## Feels like an app, not a website

- The document (`<body>`) never scrolls — `#root` owns all scrolling internally, and `.nav` sits
  entirely outside any scrollable container, so there's no rubber-band bounce that drags the header
  or chat input around on iOS.
- `apple-mobile-web-app-capable` + a touch icon are set up, so "Add to Home Screen" launches
  full-screen with no Safari chrome at all.
- Safe-area insets (`env(safe-area-inset-*)`) are respected around the nav and chat input, so
  content clears the notch/Dynamic Island and home-indicator area.
