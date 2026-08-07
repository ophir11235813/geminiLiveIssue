// Admin status is driven by an allowlist of email addresses (ADMIN_EMAILS,
// comma-separated) rather than by "whoever happens to sign up first" — that
// was only ever meant as a zero-config bootstrap for a brand-new deployment.
const raw = process.env.ADMIN_EMAILS || '';
const adminEmailSet = new Set(
  raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function adminEmailsConfigured(): boolean {
  return adminEmailSet.size > 0;
}

export function isConfiguredAdminEmail(email: string): boolean {
  return adminEmailSet.has(email.trim().toLowerCase());
}
