CREATE TABLE IF NOT EXISTS canvas_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_assets_user_created
    ON canvas_assets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS canvas_elements (
    id TEXT NOT NULL,
    canvas_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('line', 'image', 'textBox')),
    payload JSONB NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (canvas_id, id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_elements_canvas_type_updated
    ON canvas_elements(canvas_id, type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_canvas_elements_user_updated
    ON canvas_elements(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS canvas_viewports (
    canvas_id UUID NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offset_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    offset_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    scale DOUBLE PRECISION NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (canvas_id, user_id)
);

ALTER TABLE canvas_documents
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

INSERT INTO canvas_elements (id, canvas_id, user_id, type, payload, created_at, updated_at)
SELECT element->>'id', document.id, document.user_id, source.type, element, document.created_at, document.updated_at
FROM canvas_documents document
CROSS JOIN LATERAL (
    VALUES
        ('line', document.lines),
        ('image', document.images),
        ('textBox', document.text_boxes)
) AS source(type, elements)
CROSS JOIN LATERAL jsonb_array_elements(source.elements) AS element
WHERE element ? 'id'
ON CONFLICT (canvas_id, id) DO NOTHING;
