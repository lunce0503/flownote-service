CREATE TABLE IF NOT EXISTS daily_schedule_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    days_of_week TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#0f766e',
    memo TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_daily_schedule_time_range CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_daily_schedule_items_user_time
    ON daily_schedule_items(user_id, start_time ASC);

CREATE INDEX IF NOT EXISTS idx_daily_schedule_items_user_active
    ON daily_schedule_items(user_id, is_active);
