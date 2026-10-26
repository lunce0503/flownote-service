package library

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/flownote/flownote-canvas/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type objectStore interface {
	Get(context.Context, string) (*storage.Object, error)
	Put(context.Context, string, string, []byte) (string, error)
	Delete(context.Context, string) error
}
type Repo struct {
	pool  *pgxpool.Pool
	store objectStore
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo { return &Repo{pool, store} }

var notFound = httpjson.Errorf(404, "책 또는 업로드를 찾을 수 없습니다.")
var conflict = httpjson.Errorf(409, "다른 기기의 변경이 있습니다. 책장을 새로고침해 주세요.")

func rowError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound
	}
	return err
}
func readBook(row pgx.Row) (Book, error) {
	var b Book
	var metadata []byte
	err := row.Scan(&metadata, &b.Revision, &b.UpdatedAt, &b.Deleted)
	if err != nil {
		return b, rowError(err)
	}
	revision, updated, deleted := b.Revision, b.UpdatedAt, b.Deleted
	err = json.Unmarshal(metadata, &b)
	b.Revision = revision
	b.UpdatedAt = updated
	b.Deleted = deleted
	if b.Bookmarks == nil {
		b.Bookmarks = []int{}
	}
	return b, err
}

const bookColumns = `metadata, revision, updated_at, (deleted_at IS NOT NULL)`

func (r *Repo) Get(ctx context.Context, user, id string) (Book, error) {
	return readBook(r.pool.QueryRow(ctx, `SELECT `+bookColumns+` FROM library_books WHERE user_id=$1 AND id=$2`, user, id))
}
func (r *Repo) List(ctx context.Context, user, cursor string) ([]Book, string, error) {
	if cursor == "" {
		cursor = "00000000-0000-0000-0000-000000000000"
	}
	if !validID(cursor) {
		return nil, "", httpjson.Errorf(400, "책장 커서가 올바르지 않습니다.")
	}
	rows, err := r.pool.Query(ctx, `SELECT `+bookColumns+` FROM library_books WHERE user_id=$1 AND id>$2::uuid ORDER BY id LIMIT 51`, user, cursor)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	books := []Book{}
	for rows.Next() {
		b, err := readBook(rows)
		if err != nil {
			return nil, "", err
		}
		books = append(books, b)
	}
	if err = rows.Err(); err != nil {
		return nil, "", err
	}
	next := ""
	if len(books) > 50 {
		books = books[:50]
		next = books[49].ID
	}
	return books, next, nil
}

type Upload struct {
	ID         string `json:"id"`
	Book       Book   `json:"book"`
	ChunkBytes int    `json:"chunkBytes"`
	Parts      []int  `json:"parts"`
}

func (r *Repo) StartUpload(ctx context.Context, user string, book Book) (Upload, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Upload{}, err
	}
	defer tx.Rollback(ctx)
	// Serializes repeated starts and bounds unfinished storage per account.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, user); err != nil {
		return Upload{}, err
	}
	var existing bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM library_books WHERE id=$1)`, book.ID).Scan(&existing); err != nil {
		return Upload{}, err
	}
	if existing {
		return Upload{}, conflict
	}
	var upload Upload
	var metadata []byte
	err = tx.QueryRow(ctx, `SELECT id::text,metadata FROM library_uploads WHERE user_id=$1 AND book_id=$2 AND expires_at>now() ORDER BY created_at DESC LIMIT 1`, user, book.ID).Scan(&upload.ID, &metadata)
	if err == nil {
		if err = json.Unmarshal(metadata, &upload.Book); err != nil {
			return Upload{}, err
		}
		if upload.Book.Bytes != book.Bytes || upload.Book.Filename != book.Filename {
			return Upload{}, conflict
		}
	} else if errors.Is(err, pgx.ErrNoRows) {
		var count int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM library_uploads u WHERE u.user_id=$1 AND u.expires_at>now() AND NOT EXISTS(SELECT 1 FROM library_books b WHERE b.upload_id=u.id AND b.user_id=u.user_id)`, user).Scan(&count); err != nil {
			return Upload{}, err
		}
		if count >= 4 {
			return Upload{}, httpjson.Errorf(429, "진행 중인 책 업로드를 먼저 완료해 주세요.")
		}
		upload.ID = newID()
		upload.Book = book
		metadata, _ = json.Marshal(book)
		if _, err = tx.Exec(ctx, `INSERT INTO library_uploads(id,user_id,book_id,metadata) VALUES($1,$2,$3,$4)`, upload.ID, user, book.ID, metadata); err != nil {
			return Upload{}, err
		}
	} else {
		return Upload{}, err
	}
	rows, err := tx.Query(ctx, `SELECT part FROM library_upload_chunks WHERE upload_id=$1 ORDER BY part`, upload.ID)
	if err != nil {
		return Upload{}, err
	}
	upload.Parts = []int{}
	for rows.Next() {
		var part int
		if err = rows.Scan(&part); err != nil {
			rows.Close()
			return Upload{}, err
		}
		upload.Parts = append(upload.Parts, part)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Upload{}, err
	}
	upload.ChunkBytes = ChunkBytes
	return upload, tx.Commit(ctx)
}
func (r *Repo) UploadBook(ctx context.Context, user, id string) (Book, error) {
	var metadata []byte
	err := r.pool.QueryRow(ctx, `SELECT metadata FROM library_uploads WHERE id=$1 AND user_id=$2 AND expires_at>now()`, id, user).Scan(&metadata)
	if err != nil {
		return Book{}, rowError(err)
	}
	var book Book
	err = json.Unmarshal(metadata, &book)
	return book, err
}
func (r *Repo) PutChunk(ctx context.Context, user, id string, part int, data []byte, expectedHash string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var metadata []byte
	err = tx.QueryRow(ctx, `SELECT metadata FROM library_uploads WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE`, id, user).Scan(&metadata)
	if err != nil {
		return rowError(err)
	}
	var b Book
	if err = json.Unmarshal(metadata, &b); err != nil {
		return err
	}
	hash := sha256.Sum256(data)
	digest := hex.EncodeToString(hash[:])
	if int64(len(data)) != chunkSize(b.Bytes, part) || digest != expectedHash {
		return httpjson.Errorf(400, "PDF 조각의 크기 또는 해시가 다릅니다.")
	}
	if part == 0 && !bytes.Contains(data[:min(len(data), 1024)], []byte("%PDF-")) {
		return httpjson.Errorf(400, "올바른 PDF 파일이 아닙니다.")
	}
	var prior string
	err = tx.QueryRow(ctx, `SELECT sha256 FROM library_upload_chunks WHERE upload_id=$1 AND part=$2`, id, part).Scan(&prior)
	if err == nil {
		if prior != digest {
			return conflict
		}
		return tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if _, err = r.store.Put(ctx, chunkKey(user, b.ID, id, part), "application/octet-stream", data); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO library_upload_chunks(upload_id,part,byte_size,sha256) VALUES($1,$2,$3,$4)`, id, part, len(data), digest)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type Part struct {
	Key    string `json:"key"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

func (r *Repo) Complete(ctx context.Context, user, id string) (Book, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Book{}, err
	}
	defer tx.Rollback(ctx)
	var metadata []byte
	var bookID string
	err = tx.QueryRow(ctx, `SELECT metadata,book_id::text FROM library_uploads WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user).Scan(&metadata, &bookID)
	if err != nil {
		return Book{}, rowError(err)
	}
	var b Book
	if err = json.Unmarshal(metadata, &b); err != nil {
		return b, err
	}
	var completed bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM library_books WHERE id=$1 AND user_id=$2 AND upload_id=$3)`, bookID, user, id).Scan(&completed); err != nil {
		return b, err
	}
	if completed {
		return readBook(tx.QueryRow(ctx, `SELECT `+bookColumns+` FROM library_books WHERE id=$1 AND user_id=$2`, bookID, user))
	}
	var alive bool
	if err = tx.QueryRow(ctx, `SELECT expires_at>now() FROM library_uploads WHERE id=$1`, id).Scan(&alive); err != nil {
		return b, err
	}
	if !alive {
		return b, httpjson.Errorf(410, "업로드가 만료됐습니다. 다시 시도해 주세요.")
	}
	rows, err := tx.Query(ctx, `SELECT part,byte_size,sha256 FROM library_upload_chunks WHERE upload_id=$1 ORDER BY part`, id)
	if err != nil {
		return b, err
	}
	parts := []Part{}
	for rows.Next() {
		var n int
		var p Part
		if err = rows.Scan(&n, &p.Bytes, &p.SHA256); err != nil {
			rows.Close()
			return b, err
		}
		if n != len(parts) || p.Bytes != chunkSize(b.Bytes, n) {
			rows.Close()
			return b, httpjson.Errorf(400, "PDF 조각 순서가 올바르지 않습니다.")
		}
		p.Key = chunkKey(user, bookID, id, n)
		parts = append(parts, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return b, err
	}
	if len(parts) != chunkCount(b.Bytes) {
		return b, httpjson.Errorf(400, "PDF 업로드가 아직 완료되지 않았습니다.")
	}
	raw, _ := json.Marshal(parts)
	result, err := readBook(tx.QueryRow(ctx, `INSERT INTO library_books(id,user_id,metadata,file_parts,upload_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING `+bookColumns, bookID, user, metadata, raw, id))
	if errors.Is(err, notFound) {
		return b, conflict
	}
	if err != nil {
		return b, err
	}
	// Retain session as an idempotency receipt; cleanup never removes a completed book's parts.
	if err = tx.Commit(ctx); err != nil {
		return b, err
	}
	return result, nil
}
func (r *Repo) Patch(ctx context.Context, user, id string, revision int64, changes Changes) (Book, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Book{}, err
	}
	defer tx.Rollback(ctx)
	b, err := readBook(tx.QueryRow(ctx, `SELECT `+bookColumns+` FROM library_books WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE`, id, user))
	if err != nil {
		return b, err
	}
	if b.Revision != revision {
		return b, conflict
	}
	b, err = changes.Apply(b)
	if err != nil {
		return b, err
	}
	raw, _ := json.Marshal(b)
	saved, err := readBook(tx.QueryRow(ctx, `UPDATE library_books SET metadata=$1,revision=revision+1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING `+bookColumns, raw, id, user))
	if err != nil {
		return b, err
	}
	return saved, tx.Commit(ctx)
}
func (r *Repo) Delete(ctx context.Context, user, id string, revision int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	b, err := readBook(tx.QueryRow(ctx, `SELECT `+bookColumns+` FROM library_books WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, user))
	if err != nil {
		return err
	}
	if b.Deleted {
		return nil
	}
	if b.Revision != revision {
		return conflict
	}
	// Tombstone first. Other devices must not re-upload deleted books.
	if _, err = tx.Exec(ctx, `UPDATE library_books SET deleted_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1 AND user_id=$2`, id, user); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM library_terms WHERE book_id=$1 AND user_id=$2`, id, user); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (r *Repo) File(ctx context.Context, user, id string) (Book, []Part, error) {
	var metadata, raw []byte
	var b Book
	err := r.pool.QueryRow(ctx, `SELECT metadata,file_parts FROM library_books WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, id, user).Scan(&metadata, &raw)
	if err != nil {
		return b, nil, rowError(err)
	}
	if err = json.Unmarshal(metadata, &b); err != nil {
		return b, nil, err
	}
	var parts []Part
	err = json.Unmarshal(raw, &parts)
	return b, parts, err
}

// Cleanup bounds unfinished uploads; failed object deletion keeps its durable retry record.
// Deleted books retain only their tombstone after private objects have been removed.
func (r *Repo) Cleanup(ctx context.Context) error {
	rows, err := r.pool.Query(ctx, `SELECT u.id::text,u.user_id::text,u.book_id::text,u.metadata FROM library_uploads u WHERE u.expires_at<now() AND NOT EXISTS(SELECT 1 FROM library_books b WHERE b.upload_id=u.id) LIMIT 10`)
	if err != nil {
		return err
	}
	type stale struct {
		id, user, book string
		meta           []byte
	}
	pending := []stale{}
	for rows.Next() {
		var s stale
		if err = rows.Scan(&s.id, &s.user, &s.book, &s.meta); err != nil {
			rows.Close()
			return err
		}
		pending = append(pending, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, s := range pending {
		var b Book
		if err = json.Unmarshal(s.meta, &b); err != nil {
			return err
		}
		for p := 0; p < chunkCount(b.Bytes); p++ {
			if err = r.store.Delete(ctx, chunkKey(s.user, s.book, s.id, p)); err != nil {
				return err
			}
		}
		if _, err = r.pool.Exec(ctx, `DELETE FROM library_uploads WHERE id=$1 AND expires_at<now()`, s.id); err != nil {
			return err
		}
	}
	rows, err = r.pool.Query(ctx, `SELECT id::text,user_id::text,file_parts FROM library_books WHERE deleted_at IS NOT NULL AND file_parts<>'[]'::jsonb LIMIT 10`)
	if err != nil {
		return err
	}
	pending = []stale{}
	for rows.Next() {
		var s stale
		if err = rows.Scan(&s.id, &s.user, &s.meta); err != nil {
			rows.Close()
			return err
		}
		pending = append(pending, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, s := range pending {
		var parts []Part
		if err = json.Unmarshal(s.meta, &parts); err != nil {
			return err
		}
		for _, p := range parts {
			if err = r.store.Delete(ctx, p.Key); err != nil {
				return err
			}
		}
		if _, err = r.pool.Exec(ctx, `UPDATE library_books SET file_parts='[]'::jsonb,metadata=metadata||'{"cover":""}'::jsonb WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL`, s.id, s.user); err != nil {
			return err
		}
	}
	_, err = r.pool.Exec(ctx, `DELETE FROM library_uploads u WHERE u.expires_at<now() AND EXISTS(SELECT 1 FROM library_books b WHERE b.upload_id=u.id)`)
	return err
}
