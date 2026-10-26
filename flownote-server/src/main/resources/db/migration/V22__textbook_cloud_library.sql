-- Account-scoped private PDF library. Originals stay in S3, split into bounded chunks.
CREATE TABLE library_books (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metadata jsonb NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    file_parts jsonb NOT NULL,
    upload_id uuid NOT NULL,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_books_owner_id ON library_books(user_id, id);

CREATE TABLE library_uploads (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id uuid NOT NULL,
    metadata jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX library_uploads_owner ON library_uploads(user_id, book_id);
CREATE INDEX library_uploads_expiry ON library_uploads(expires_at);
CREATE TABLE library_upload_chunks (
    upload_id uuid NOT NULL REFERENCES library_uploads(id) ON DELETE CASCADE,
    part integer NOT NULL CHECK (part >= 0 AND part < 100),
    byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 1048576),
    sha256 text NOT NULL,
    PRIMARY KEY(upload_id, part)
);

CREATE TABLE library_terms (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    page integer NOT NULL CHECK (page > 0),
    term text NOT NULL CHECK (length(term) BETWEEN 1 AND 120),
    definition text NOT NULL DEFAULT '',
    source_url text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, book_id, page, term)
);
CREATE INDEX library_terms_owner_book ON library_terms(user_id, book_id, created_at DESC);
