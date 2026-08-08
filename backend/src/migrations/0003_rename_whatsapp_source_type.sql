-- The "WhatsApp export" source type label was renamed to "Conversation
-- thread" to avoid naming the specific platform anywhere in the app.
-- Idempotent: a no-op once already renamed, so safe to run on every boot
-- like every other migration here.
UPDATE documents SET source_type = 'Conversation thread' WHERE source_type = 'WhatsApp export';
