-- Same pattern as the password reset token: only a hash is ever stored,
-- single active token per user, with an expiry. Lets a new signup confirm
-- ownership of their email and get in automatically (no admin click needed)
-- as long as they already passed the signup passphrase gate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
