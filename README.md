# Family Context Bot

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
| Auth     | Roll-your-own — email/password + JWT in an httpOnly cookie |
| LLM      | Claude API (`@anthropic-ai/sdk`)                     |
| Email    | [Resend](https://resend.com)                         |

### Decisions made on the spec's open questions

- **Email provider: Resend.** Simplest API for a Node backend, generous free tier. If
  `RESEND_API_KEY` isn't set, emails are just logged to the console — the app still works without
  it configured (handy for local dev).
- **Backend hosting: a standalone Express server**, not Vercel serverless functions. It needs a
  persistent Postgres connection pool and file uploads (multer), which fit a normal long-running
  server better than serverless. A `Dockerfile` is included so it can go on Railway, Render, Fly,
  or similar. The frontend still deploys to Vercel as originally specified.
- **Auth: roll-your-own** (bcrypt + JWT), not Clerk. Clerk is a fine choice too, but it pulls in an
  external account system for what's a small, single-tenant, invite-only app — plain
  email/password with an approval gate is simpler to reason about and self-contained.
- **Bootstrapping the first admin:** the very first person to sign up is auto-approved as `admin`
  (no manual DB edit needed). Everyone after that starts `pending` until an admin approves them.

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

Open `http://localhost:5173`, sign up — the first account becomes the admin automatically and is
immediately approved. Anyone who signs up after that lands on a "waiting for approval" screen until
the admin approves them from `/admin`.

## Environment variables

**backend/.env**

| Var                | Required | Notes                                                       |
| ------------------ | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`     | yes      | Postgres connection string                                   |
| `PGSSL`            | no       | `require` for hosted Postgres, `disable` for local (default) |
| `JWT_SECRET`       | yes      | Long random string (`openssl rand -hex 32`)                  |
| `ANTHROPIC_API_KEY`| yes      | Claude API key                                                |
| `CLAUDE_MODEL`     | no       | Defaults to `claude-sonnet-5`                                 |
| `RESEND_API_KEY`   | no       | Omit to log emails to the console instead of sending them     |
| `FROM_EMAIL`       | no       | Sender address for approval/revoke emails                     |
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
| `GET /documents`                  | approved          | List all documents                     |
| `POST /documents`                 | approved          | Add a document (paste JSON or multipart file) |
| `PATCH /documents/:id`            | admin or uploader | Edit title/source type/content         |
| `DELETE /documents/:id`           | admin or uploader | Delete a document                      |
| `POST /chat`                      | approved          | Ask a question, get a Claude-generated answer grounded in all documents |
| `GET /chat/history`               | approved          | This user's chat history               |

## Notes / v1 limitations (matches the spec's non-goals)

- No vector DB — every chat request concatenates all documents (capped at ~150k characters) and
  sends them straight to Claude as context. Fine at small scale; if the corpus grows a lot, add
  keyword filtering before that call.
- No OCR — images (flyers, photos) aren't text-extracted. Describe them in a pasted-text document
  instead. `.txt` and `.pdf` uploads are extracted automatically.
- No Gmail integration — content is added manually via the Documents page, as specified.
