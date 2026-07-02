ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'USER';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'));
UPDATE users SET role = 'ADMIN' WHERE lower(username) = 'lunce';

ALTER TABLE canvas_elements
    ADD COLUMN IF NOT EXISTS storage_status VARCHAR(16) NOT NULL DEFAULT 'READY',
    ADD COLUMN IF NOT EXISTS storage_error_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS r2_synced_at TIMESTAMPTZ;
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_storage_status_check;
ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_storage_status_check
    CHECK (storage_status IN ('PENDING', 'READY', 'FAILED'));

CREATE TABLE IF NOT EXISTS canvas_storage_jobs (
    id UUID PRIMARY KEY,
    canvas_id UUID REFERENCES canvas_documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    element_id TEXT,
    operation_type VARCHAR(32) NOT NULL,
    object_key TEXT NOT NULL,
    payload JSONB,
    content_type VARCHAR(128),
    priority INTEGER NOT NULL DEFAULT 10,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    last_error_code VARCHAR(64),
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT canvas_storage_jobs_operation_check
        CHECK (operation_type IN ('UPLOAD_ELEMENT', 'DELETE_OBJECT', 'WRITE_SNAPSHOT')),
    CONSTRAINT canvas_storage_jobs_status_check
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_canvas_storage_jobs_ready
    ON canvas_storage_jobs (status, priority DESC, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_canvas_storage_jobs_canvas
    ON canvas_storage_jobs (canvas_id, created_at DESC);

CREATE TABLE IF NOT EXISTS canvas_operation_events (
    id BIGSERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    mutation_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    canvas_id UUID REFERENCES canvas_documents(id) ON DELETE SET NULL,
    operation_type VARCHAR(32) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    priority INTEGER NOT NULL,
    status VARCHAR(24) NOT NULL,
    error_code VARCHAR(64),
    queue_ms BIGINT,
    db_ms BIGINT,
    r2_ms BIGINT,
    total_ms BIGINT,
    payload_bytes BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canvas_operation_events_created
    ON canvas_operation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_operation_events_canvas
    ON canvas_operation_events (canvas_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_operation_events_status
    ON canvas_operation_events (status, created_at DESC);
