ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS id UUID;
UPDATE canvas_documents SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE canvas_documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE canvas_documents ALTER COLUMN id SET NOT NULL;
ALTER TABLE canvas_documents ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '기본 캔버스';

ALTER TABLE canvas_documents DROP CONSTRAINT IF EXISTS canvas_documents_pkey;
ALTER TABLE canvas_documents ADD CONSTRAINT canvas_documents_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_canvas_documents_user_updated
    ON canvas_documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS canvas_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    canvas_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_folders_user_category
    ON canvas_folders(user_id, category, name);
