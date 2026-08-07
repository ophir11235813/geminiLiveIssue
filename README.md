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
| Auth     | Roll-your-own — email/password + JWT bearer token          |
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

## Notes / v1 limitations (matches the spec's non-goals)

- No vector DB — every chat request concatenates all documents (capped at ~150k characters) and
  sends them straight to Claude as context. Fine at small scale; if the corpus grows a lot, add
  keyword filtering before that call.
- No OCR — images (flyers, photos) aren't text-extracted. Describe them in a pasted-text document
  instead. `.txt` and `.pdf` uploads are extracted automatically.
- No Gmail integration — content is added manually via the Documents page, as specified.
