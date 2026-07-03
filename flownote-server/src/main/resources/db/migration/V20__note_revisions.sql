ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_client_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_user_revision
    ON notes(user_id, revision DESC);
