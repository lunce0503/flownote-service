ALTER TABLE canvas_documents
    ADD COLUMN IF NOT EXISTS elements_object_key TEXT,
    ADD COLUMN IF NOT EXISTS elements_byte_size BIGINT,
    ADD COLUMN IF NOT EXISTS elements_public_url TEXT;

CREATE INDEX IF NOT EXISTS idx_canvas_documents_elements_object_key
    ON canvas_documents(elements_object_key)
    WHERE elements_object_key IS NOT NULL;
