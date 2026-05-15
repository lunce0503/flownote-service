CREATE TABLE IF NOT EXISTS social (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_timestamp ON social(timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_social_user_timestamp ON social(user_id, timestamp ASC);
