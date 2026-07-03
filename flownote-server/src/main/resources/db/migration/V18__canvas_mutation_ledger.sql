CREATE TABLE IF NOT EXISTS canvas_mutations (
    canvas_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    mutation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED')),
    result_revision BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (canvas_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_mutations_user_completed
    ON canvas_mutations(user_id, completed_at DESC);

