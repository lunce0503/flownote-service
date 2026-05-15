CREATE TABLE IF NOT EXISTS social_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_room_members (
    room_id UUID NOT NULL REFERENCES social_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

ALTER TABLE social ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES social_rooms(id) ON DELETE CASCADE;

DO $$
DECLARE
    legacy_room_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM social WHERE room_id IS NULL) THEN
        INSERT INTO social_rooms (id, name, created_by)
        SELECT gen_random_uuid(), 'Social', users.id
        FROM users
        ORDER BY users.created_at ASC
        LIMIT 1
        RETURNING id INTO legacy_room_id;

        IF legacy_room_id IS NOT NULL THEN
            INSERT INTO social_room_members (room_id, user_id)
            SELECT legacy_room_id, users.id
            FROM users
            ON CONFLICT DO NOTHING;

            UPDATE social
            SET room_id = legacy_room_id
            WHERE room_id IS NULL;
        END IF;
    END IF;
END $$;

ALTER TABLE social ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_room_timestamp ON social(room_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_social_room_members_user ON social_room_members(user_id, room_id);
