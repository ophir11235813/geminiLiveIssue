import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import dns from 'dns';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Gmail SMTP is preferred: it sends from a real inbox with no domain
// verification required, unlike Resend's sandbox sender (which can only
// deliver to the Resend account's own address without a verified domain —
// a real wall we hit before this was added). Same account/app-password as
// the email-ingestion feature, reused here for the opposite direction.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const gmailConfigured = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 465;

// Railway's outbound network doesn't route IPv6, but nodemailer's own DNS
// resolution (lib/shared/resolveHostname) fetches BOTH the A and AAAA
// records for the host and then picks *at random* between them — it has no
// option to prefer IPv4, and dns.setDefaultResultOrder doesn't help here
// either, since it calls dns.resolve4/resolve6 directly rather than
// dns.lookup. In practice that meant roughly half of all send attempts
// picked Gmail's IPv6 address and failed outright with ENETUNREACH. Instead
// of letting nodemailer resolve the hostname at all, resolve it to a literal
// IPv4 address ourselves first and hand that to nodemailer as `host` — its
// resolver short-circuits (net.isIP check) and never touches AAAA records.
async function resolveGmailSmtpIPv4(): Promise<string> {
  const addresses = await dns.promises.resolve4(GMAIL_SMTP_HOST);
  if (!addresses.length) {
    throw new Error(`No IPv4 addresses found for ${GMAIL_SMTP_HOST}`);
  }
  return addresses[Math.floor(Math.random() * addresses.length)];
}

function createGmailTransport(ipv4Host: string) {
  return nodemailer.createTransport({
    host: ipv4Host,
    port: GMAIL_SMTP_PORT,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    // Connecting by literal IP skips SNI/hostname matching that TLS would
    // otherwise infer from `host` — set it explicitly so the handshake still
    // validates against Gmail's real certificate.
    tls: { servername: GMAIL_SMTP_HOST },
    // Nodemailer's default connection timeout is 2 minutes — fine for a
    // real failure, but it means one transient network blip silently sits
    // for 2 minutes before the retry loop below even gets to try again.
    // Fail fast instead so retries actually happen promptly.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend stays supported as a fallback for anyone who'd rather use it (or
// already has a verified domain there) — just no longer the default.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const RESEND_FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

async function send(to: string, subject: string, html: string): Promise<void> {
  if (gmailConfigured) {
    // A transactional email (approval, revoke, password reset) is worth a
    // couple of retries — a bare network timeout shouldn't mean the user
    // just never hears back. Callers already treat this as fire-and-forget,
    // so retrying here doesn't hold up any HTTP response. Re-resolving the
    // IP on each attempt also means a retry isn't doomed to hit the same bad
    // address as the one that just failed.
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const ipv4Host = await resolveGmailSmtpIPv4();
        const transport = createGmailTransport(ipv4Host);
        await transport.sendMail({
          from: `Springhill Sherpa <${GMAIL_USER}>`,
          to,
          subject,
          html,
        });
        return;
      } catch (err) {
        const lastAttempt = attempt === maxAttempts;
        console.error(
          `Failed to send email via Gmail SMTP (attempt ${attempt}/${maxAttempts})`,
          err
        );
        if (!lastAttempt) await sleep(attempt * 3_000);
      }
    }
    return;
  }

  if (resend) {
    try {
      await resend.emails.send({ from: RESEND_FROM_EMAIL, to, subject, html });
    } catch (err) {
      console.error('Failed to send email via Resend', err);
    }
    return;
  }

  console.log(`[email:disabled] Would send "${subject}" to ${to}\n${html}`);
}

export function sendApprovalEmail(to: string): Promise<void> {
  return send(
    to,
    "You're approved — Springhill Sherpa",
    `<p>Good news — your account has been approved.</p>
     <p>Log in here: <a href="${APP_URL}">${APP_URL}</a></p>
     <p>Use the email and password you signed up with.</p>`
  );
}

export function sendRevokeEmail(to: string): Promise<void> {
  return send(
    to,
    'Your access has been revoked — Springhill Sherpa',
    `<p>Your access to Springhill Sherpa has been revoked.</p>
     <p>If you believe this is a mistake, please contact the admin.</p>`
  );
}

export function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  return send(
    to,
    'Reset your password — Springhill Sherpa',
    `<p>Someone (hopefully you) asked to reset the password for this account.</p>
     <p><a href="${resetLink}">Click here to set a new password</a> — this link works for 1 hour.</p>
     <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`
  );
}
