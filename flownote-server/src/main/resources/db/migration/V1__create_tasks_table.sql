CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_name TEXT NOT NULL,
    category TEXT,
    difficulty_level INTEGER,
    status TEXT,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    due_date DATE,
    memo TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
