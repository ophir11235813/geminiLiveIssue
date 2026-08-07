import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log(`[email:disabled] Would send "${subject}" to ${to}\n${html}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
  } catch (err) {
    console.error('Failed to send email', err);
  }
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
