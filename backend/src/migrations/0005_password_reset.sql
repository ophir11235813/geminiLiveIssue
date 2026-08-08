-- A reset token is a random value; only its hash is ever stored, same
-- principle as a password. Single active token per user (a new request
-- overwrites the old one) — plenty for this app's scale.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
