ALTER TABLE canvas_elements
    ADD COLUMN IF NOT EXISTS object_key TEXT,
    ADD COLUMN IF NOT EXISTS byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS public_url TEXT,
    ADD COLUMN IF NOT EXISTS bbox_min_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS bbox_min_y DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS bbox_max_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS bbox_max_y DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_canvas_elements_canvas_bbox
    ON canvas_elements(canvas_id, bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y);

CREATE INDEX IF NOT EXISTS idx_canvas_elements_object_key
    ON canvas_elements(object_key)
    WHERE object_key IS NOT NULL;

ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS content_object_key TEXT,
    ADD COLUMN IF NOT EXISTS content_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS content_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_content_object_key
    ON notes(content_object_key)
    WHERE content_object_key IS NOT NULL;
