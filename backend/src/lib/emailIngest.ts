import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { pool } from '../db';
import { describeImage, isSupportedImageType } from './claude';

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

export function isEmailIngestConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
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
        } catch (err) {
          // One bad message shouldn't stop the rest of the batch — leave it
          // unread so it gets retried next poll (worst case it's retried
          // forever if it's genuinely unparseable, which is an acceptable
          // trade-off next to silently losing it).
          console.error(`Failed to ingest inbox message uid ${uid}`, err);
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
  const content = bodyText.trim() || '(This email had no readable text content.)';
  const title = titleFromSubject(parsed.subject);

  // uploader_id stays NULL — there's no signed-in app user in the loop for
  // an automatically-ingested email; the frontend shows these as
  // "Auto-imported". Still fully editable/deletable by any admin afterward.
  await pool.query(
    `INSERT INTO documents (uploader_id, title, source_type, content)
     VALUES (NULL, $1, 'Email', $2)`,
    [title, `From: ${fromAddress}\n\n${content}`]
  );
  console.log(`Email ingestion: saved "${title}" as a document`);

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
