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
ON CONFLICT (canvas_id, id) DO UPDATE
SET type = EXCLUDED.type,
    payload = EXCLUDED.payload,
    updated_at = NOW();

UPDATE canvas_documents
SET lines = '[]'::jsonb,
    images = '[]'::jsonb,
    text_boxes = '[]'::jsonb,
    revision = revision + 1,
    updated_at = NOW()
WHERE jsonb_array_length(lines) > 0
   OR jsonb_array_length(images) > 0
   OR jsonb_array_length(text_boxes) > 0;
