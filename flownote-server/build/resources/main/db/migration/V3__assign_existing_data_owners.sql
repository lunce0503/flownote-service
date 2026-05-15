CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, username, email, password_hash, nickname)
SELECT gen_random_uuid(), 'kkh0108', 'kkh0108.kwon@gmail.com', '', 'kkh0108'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'kkh0108.kwon@gmail.com'
);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

UPDATE notes
SET user_id = (SELECT id FROM users WHERE email = 'kkh0108.kwon@gmail.com' LIMIT 1)
WHERE user_id IS NULL;

UPDATE tasks
SET user_id = (SELECT id FROM users WHERE email = 'kkh0108.kwon@gmail.com' LIMIT 1)
WHERE user_id IS NULL;

DO $$
BEGIN
    IF to_regclass('public.chatmessage') IS NOT NULL THEN
        INSERT INTO chat_messages (id, user_id, sender, message, timestamp)
        SELECT
            id,
            (SELECT users.id FROM users WHERE email = 'kkh0108.kwon@gmail.com' LIMIT 1),
            sender,
            message,
            timestamp
        FROM chatmessage
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

UPDATE chat_messages
SET user_id = (SELECT id FROM users WHERE email = 'kkh0108.kwon@gmail.com' LIMIT 1)
WHERE user_id IS NULL;

ALTER TABLE notes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN user_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS canvas_documents (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    text_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_timestamp ON chat_messages(user_id, timestamp ASC);
