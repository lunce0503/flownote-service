ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS memo_object_key TEXT,
    ADD COLUMN IF NOT EXISTS memo_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS memo_public_url TEXT,
    ADD COLUMN IF NOT EXISTS links_object_key TEXT,
    ADD COLUMN IF NOT EXISTS links_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS links_public_url TEXT,
    ADD COLUMN IF NOT EXISTS time_logs_object_key TEXT,
    ADD COLUMN IF NOT EXISTS time_logs_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS time_logs_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_memo_object_key
    ON tasks(memo_object_key)
    WHERE memo_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_links_object_key
    ON tasks(links_object_key)
    WHERE links_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_time_logs_object_key
    ON tasks(time_logs_object_key)
    WHERE time_logs_object_key IS NOT NULL;

ALTER TABLE daily_schedule_items
    ADD COLUMN IF NOT EXISTS memo_object_key TEXT,
    ADD COLUMN IF NOT EXISTS memo_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS memo_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_schedule_items_memo_object_key
    ON daily_schedule_items(memo_object_key)
    WHERE memo_object_key IS NOT NULL;
