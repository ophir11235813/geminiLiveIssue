import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Gmail SMTP is preferred: it sends from a real inbox with no domain
// verification required, unlike Resend's sandbox sender (which can only
// deliver to the Resend account's own address without a verified domain —
// a real wall we hit before this was added). Same account/app-password as
// the email-ingestion feature, reused here for the opposite direction.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const gmailTransport =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null;

// Resend stays supported as a fallback for anyone who'd rather use it (or
// already has a verified domain there) — just no longer the default.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const RESEND_FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

async function send(to: string, subject: string, html: string): Promise<void> {
  if (gmailTransport) {
    try {
      await gmailTransport.sendMail({
        from: `Springhill Sherpa <${GMAIL_USER}>`,
        to,
        subject,
        html,
      });
      return;
    } catch (err) {
      console.error('Failed to send email via Gmail SMTP', err);
      return;
    }
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
