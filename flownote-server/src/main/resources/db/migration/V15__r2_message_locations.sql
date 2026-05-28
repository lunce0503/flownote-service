ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS message_object_key TEXT,
    ADD COLUMN IF NOT EXISTS message_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS message_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_message_object_key
    ON chat_messages(message_object_key)
    WHERE message_object_key IS NOT NULL;

ALTER TABLE social
    ADD COLUMN IF NOT EXISTS message_object_key TEXT,
    ADD COLUMN IF NOT EXISTS message_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS message_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_social_message_object_key
    ON social(message_object_key)
    WHERE message_object_key IS NOT NULL;
