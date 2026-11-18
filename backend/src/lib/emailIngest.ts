import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { pool } from '../db';
import { describeImage, extractRelevantEmailContext, isSupportedImageType } from './claude';

// A dedicated Gmail inbox that people forward context to — polled on an
// interval (not a webhook), so no domain or inbound-email service is
// needed. Entirely optional: unset either var and this just never starts.
// Same GMAIL_USER/GMAIL_APP_PASSWORD as lib/email.ts's outbound sending —
// one account, one app password, both directions.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const POLL_MINUTES = Number(process.env.GMAIL_INGEST_POLL_MINUTES) || 5;
// Only messages whose subject contains this (case-insensitive substring,
// per IMAP SEARCH semantics) get ingested — anything else in the inbox is
// left completely untouched (not marked read, not looked at again until it
// either matches or the next poll re-checks it). Lets the same dedicated
// inbox safely receive other mail without it accidentally becoming context.
const SUBJECT_FILTER = process.env.GMAIL_INGEST_SUBJECT_FILTER || 'context';
// How many times a single message gets retried after a failure before
// processInbox gives up on it and marks it read anyway. Keyed by IMAP uid,
// in-memory only — reset on restart, which just means a fresh boot gives a
// still-stuck message another bounded set of attempts rather than resuming
// an ever-growing count, which is fine for what this guards against.
const MAX_INGEST_ATTEMPTS = 3;
const failedAttempts = new Map<number, number>();

export function isEmailIngestConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

// Lets the frontend tell people where to forward things and what word the
// subject needs, without duplicating GMAIL_USER/GMAIL_INGEST_SUBJECT_FILTER
// as separate frontend env vars — this stays the single source of truth.
export function getIngestInfo(): { email: string; subjectKeyword: string } | null {
  if (!isEmailIngestConfigured()) return null;
  return { email: GMAIL_USER!, subjectKeyword: SUBJECT_FILTER };
}

function titleFromSubject(subject: string | undefined): string {
  const trimmed = (subject || '').trim();
  return trimmed || `Forwarded email — ${new Date().toLocaleDateString()}`;
}

async function processInbox(): Promise<void> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER!, pass: GMAIL_APP_PASSWORD! },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false, subject: SUBJECT_FILTER }, { uid: true });
      if (!uids || uids.length === 0) return;

      for (const uid of uids) {
        try {
          await ingestMessage(client, uid);
          failedAttempts.delete(uid);
        } catch (err) {
          // One bad message shouldn't stop the rest of the batch — leave it
          // unread so it gets retried next poll. But only up to a point: a
          // persistent failure (the database being unreachable, say — this
          // is exactly what happened when a paused Supabase project turned
          // every save into a dead end) would otherwise retry the same
          // message forever, re-running the uncached Claude extraction call
          // every single poll with no way to ever succeed. Give up after a
          // few attempts instead, so a bad outage costs a handful of calls,
          // not an unbounded number of them for as long as the outage lasts.
          const attempts = (failedAttempts.get(uid) ?? 0) + 1;
          if (attempts >= MAX_INGEST_ATTEMPTS) {
            console.error(
              `Giving up on inbox message uid ${uid} after ${attempts} failed attempts — marking it read so it isn't retried forever`,
              err
            );
            failedAttempts.delete(uid);
            await client
              .messageFlagsAdd(uid, ['\\Seen'], { uid: true })
              .catch((flagErr) => console.error(`Also failed to mark uid ${uid} as read while giving up on it`, flagErr));
          } else {
            failedAttempts.set(uid, attempts);
            console.error(`Failed to ingest inbox message uid ${uid} (attempt ${attempts}/${MAX_INGEST_ATTEMPTS})`, err);
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function ingestMessage(client: ImapFlow, uid: number): Promise<void> {
  const download = await client.download(uid, undefined, { uid: true });
  const parsed = await simpleParser(download.content);

  let bodyText = (parsed.text || '').trim();

  const imageAttachments = (parsed.attachments || []).filter((a) => isSupportedImageType(a.contentType));
  for (const attachment of imageAttachments) {
    try {
      const description = await describeImage(attachment.content, attachment.contentType);
      bodyText += `\n\n[Image attachment: ${attachment.filename || 'photo'}]\n${description}`;
    } catch (err) {
      console.error('Failed to describe an email image attachment', err);
    }
  }

  const fromAddress = parsed.from?.text || 'unknown sender';
  const title = titleFromSubject(parsed.subject);
  const sentAt = parsed.date || null;

  // Extraction runs before anything is ever stored: keeps only what's
  // actually relevant as school/Hideout/Springhill context, and strips out
  // (never stores) anything that looks like an attempt to inject
  // instructions into the assistant or an inappropriate joke aimed at it —
  // that content never reaches the context store at all, only a flag noting
  // it happened does.
  const extraction = await extractRelevantEmailContext(parsed.subject || '(no subject)', bodyText || '(empty)');

  if (!extraction.relevantContent && !extraction.flagged) {
    // Nothing worth keeping and nothing worth flagging — skip it entirely
    // rather than cluttering the Documents tab with an empty entry.
    console.log(`Email ingestion: nothing relevant in "${title}", skipping`);
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    return;
  }

  const content =
    extraction.relevantContent ||
    '(No relevant context found in this email — see the flag for why it was still kept for review.)';

  // uploader_id stays NULL — there's no signed-in app user in the loop for
  // an automatically-ingested email; the frontend shows these as
  // "Auto-imported". Still fully editable/deletable by any admin afterward.
  await pool.query(
    `INSERT INTO documents (uploader_id, title, source_type, content, sender, sent_at, flagged, flag_reason)
     VALUES (NULL, $1, 'Email', $2, $3, $4, $5, $6)`,
    [title, content, fromAddress, sentAt, extraction.flagged, extraction.flagReason]
  );
  console.log(
    `Email ingestion: saved "${title}" as a document${extraction.flagged ? ' (flagged)' : ''}`
  );

  await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
}

let pollTimer: NodeJS.Timeout | undefined;

export function startEmailIngestPolling(): void {
  if (!isEmailIngestConfigured()) {
    console.log('Email ingestion not configured (GMAIL_USER/GMAIL_APP_PASSWORD unset) — skipping.');
    return;
  }

  console.log(
    `Email ingestion enabled — polling ${GMAIL_USER} every ${POLL_MINUTES} minute(s) for unread mail with "${SUBJECT_FILTER}" in the subject.`
  );

  const run = () => {
    processInbox().catch((err) => {
      console.error('Email ingestion poll failed (will retry next interval)', err);
    });
  };

  run();
  pollTimer = setInterval(run, POLL_MINUTES * 60 * 1000);
}

export function stopEmailIngestPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
}
