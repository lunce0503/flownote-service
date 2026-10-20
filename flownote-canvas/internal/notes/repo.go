package notes

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/flownote/flownote-canvas/internal/storage"
)

var (
	errNoteNotFound   = httpjson.Errorf(http.StatusNotFound, "노트를 찾을 수 없습니다.")
	errNoteConflict   = httpjson.Errorf(http.StatusConflict, "더 최신인 노트가 이미 저장되었습니다.")
	errFolderNotFound = httpjson.Errorf(http.StatusNotFound, "노트 폴더를 찾을 수 없습니다.")
)

// Repo는 Spring NoteService/NoteFolderService의 SQL과 동작을 그대로 이식한다.
// 본문은 S3에 오프로드한다. notes.content는 legacy '[]' 또는 Markdown 형식 표식이다.
// revision과 형식 표식은 같은 SQL 쓰기에서 낙관적 동시성을 지킨다.
type noteStorage interface {
	Get(context.Context, string) (*storage.Object, error)
	Put(context.Context, string, string, []byte) (string, error)
	Delete(context.Context, string) error
}

type Repo struct {
	query    func(context.Context, string, ...any) (pgx.Rows, error)
	queryRow func(context.Context, string, ...any) pgx.Row
	pool     *pgxpool.Pool
	store    noteStorage
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo {
	return &Repo{pool: pool, store: store, query: pool.Query, queryRow: pool.QueryRow}
}

const noteColumns = `id::text, title, content::text, COALESCE(content_object_key, ''), created_at, updated_at, revision, COALESCE(last_client_id, '')`

type noteRow struct {
	response  NoteResponse
	objectKey string
	content   string
}

func scanNote(row pgx.Row) (noteRow, error) {
	var n noteRow
	err := row.Scan(&n.response.ID, &n.response.Title, &n.content, &n.objectKey,
		&n.response.CreatedAt, &n.response.UpdatedAt, &n.response.Revision, &n.response.ClientID)
	return n, err
}

// resolveContent는 오프로드된 본문이 있으면 S3에서, 없으면 인라인 컬럼에서 읽는다.
func (r *Repo) resolveContent(ctx context.Context, n noteRow) (NoteResponse, error) {
	if n.objectKey == "" {
		n.response.Content = json.RawMessage(n.content)
		return n.response, nil
	}
	obj, err := r.store.Get(ctx, n.objectKey)
	if err != nil || obj == nil || !json.Valid(obj.Data) {
		return NoteResponse{}, httpjson.Errorf(http.StatusBadGateway, "노트 콘텐츠를 불러오지 못했습니다.")
	}
	n.response.Content = json.RawMessage(obj.Data)
	return n.response, nil
}

func (r *Repo) List(ctx context.Context, userID string) ([]NoteResponse, error) {
	rows, err := r.query(ctx, `
		SELECT `+noteColumns+`
		FROM notes
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	raws := make([]noteRow, 0)
	for rows.Next() {
		n, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		raws = append(raws, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	notes := make([]NoteResponse, 0, len(raws))
	for _, n := range raws {
		resolved, err := r.resolveContent(ctx, n)
		if err != nil {
			return nil, err
		}
		notes = append(notes, resolved)
	}
	return notes, nil
}

func (r *Repo) findByID(ctx context.Context, userID, noteID string) (noteRow, bool, error) {
	n, err := scanNote(r.queryRow(ctx, `
		SELECT `+noteColumns+`
		FROM notes
		WHERE id = $1 AND user_id = $2
	`, noteID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return noteRow{}, false, nil
	}
	if err != nil {
		return noteRow{}, false, err
	}
	return n, true, nil
}

func (r *Repo) Upsert(ctx context.Context, userID string, req NoteRequest) (NoteResponse, error) {
	createdAt := time.Now()
	if req.CreatedAt != nil {
		createdAt = *req.CreatedAt
	}
	// Validate again at the repository boundary. Existing content must be preserved
	// before any object upload; the SQL predicate below also fences concurrent upgrades.
	format, err := contentFormat(req.Content)
	if err != nil {
		return NoteResponse{}, err
	}
	current, found, err := r.findByID(ctx, userID, req.ID)
	if err != nil {
		return NoteResponse{}, err
	}
	if found {
		var marker struct {
			Format string `json:"format"`
		}
		_ = json.Unmarshal([]byte(current.content), &marker)
		if marker.Format == "markdown" && format != "markdown" {
			return NoteResponse{}, errNoteFormat
		}
		if current.response.Revision == req.Revision && current.response.ClientID == req.ClientID {
			return r.idempotentContent(ctx, current, req)
		}
		if req.Revision <= current.response.Revision || (format == "markdown" && req.Revision != current.response.Revision+1) {
			return NoteResponse{}, errNoteConflict
		}
	}
	if format == "markdown" {
		var incoming MarkdownContent
		_ = json.Unmarshal(req.Content, &incoming)
		// Backups are server-owned; never trust a client-provided replacement.
		incoming.LegacyOriginal = nil
		if found {
			previous, err := r.resolveContent(ctx, current)
			if err != nil {
				return NoteResponse{}, err
			}
			if markerFormat, _ := contentFormat(previous.Content); markerFormat == "markdown" {
				var old MarkdownContent
				_ = json.Unmarshal(previous.Content, &old)
				incoming.LegacyOriginal = old.LegacyOriginal
			} else {
				incoming.LegacyOriginal = previous.Content
			}
		}
		req.Content, _ = json.Marshal(incoming)
	}
	marker := "[]"
	if format == "markdown" {
		marker = `{"format":"markdown","version":1}`
	}
	content := compactJSON(req.Content)
	// A rejected concurrent write must never replace the winning revision's object.
	digest := sha256.Sum256(content)
	objectKey := strings.TrimSuffix(contentObjectKey(userID, req.ID, req.Revision, req.ClientID), ".json") + fmt.Sprintf("-%x.json", digest[:])
	publicURL, err := r.store.Put(ctx, objectKey, "application/json", content)
	if err != nil {
		return NoteResponse{}, err
	}

	n, err := scanNote(r.queryRow(ctx, `
		INSERT INTO notes (
			id, user_id, title, content, content_object_key, content_byte_size,
			content_public_url, created_at, updated_at, revision, last_client_id
		)
		VALUES ($1, $2, $3, $10::jsonb, $4, $5, $6, $7, NOW(), $8, $9)
		ON CONFLICT (id)
		DO UPDATE SET
			title = EXCLUDED.title,
			content = EXCLUDED.content,
			content_object_key = EXCLUDED.content_object_key,
			content_byte_size = EXCLUDED.content_byte_size,
			content_public_url = EXCLUDED.content_public_url,
			updated_at = NOW(),
			revision = EXCLUDED.revision,
			last_client_id = EXCLUDED.last_client_id
		WHERE notes.user_id = EXCLUDED.user_id
		  AND EXCLUDED.revision > notes.revision
    AND (COALESCE(notes.content->>'format', '') != 'markdown' OR EXCLUDED.content->>'format' = 'markdown')
    AND (COALESCE(EXCLUDED.content->>'format', '') != 'markdown' OR EXCLUDED.revision = notes.revision + 1)
		RETURNING `+noteColumns+`
	`, req.ID, userID, req.Title, objectKey, len(content), publicURL, createdAt, req.Revision, req.ClientID, marker))
	if err == nil {
		n.response.Content = req.Content
		return n.response, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return NoteResponse{}, err
	}

	// 갱신 안 됨: 같은 revision+clientId의 재시도(멱등)면 현재 상태를 돌려주고, 아니면 충돌.
	current, found, err = r.findByID(ctx, userID, req.ID)
	if err != nil {
		return NoteResponse{}, err
	}
	if found && current.response.Revision == req.Revision && current.response.ClientID == req.ClientID {
		return r.idempotentContent(ctx, current, req)
	}
	_ = r.store.Delete(ctx, objectKey)
	return NoteResponse{}, errNoteConflict
}

func (r *Repo) UpdateTitle(ctx context.Context, userID, noteID string, req NoteTitleUpdateRequest) (NoteResponse, error) {
	n, err := scanNote(r.queryRow(ctx, `
		UPDATE notes
		SET title = $1, updated_at = NOW(), revision = $2, last_client_id = $3
		WHERE id = $4 AND user_id = $5 AND revision < $2
		RETURNING `+noteColumns+`
	`, strings.TrimSpace(req.Title), req.Revision, req.ClientID, noteID, userID))
	if err == nil {
		return r.resolveContent(ctx, n)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return NoteResponse{}, err
	}

	current, found, err := r.findByID(ctx, userID, noteID)
	if err != nil {
		return NoteResponse{}, err
	}
	if !found {
		return NoteResponse{}, errNoteNotFound
	}
	if current.response.Revision == req.Revision && current.response.ClientID == req.ClientID && current.response.Title == strings.TrimSpace(req.Title) {
		return r.resolveContent(ctx, current)
	}
	return NoteResponse{}, errNoteConflict
}

func (r *Repo) Delete(ctx context.Context, userID, noteID string) (NoteResponse, error) {
	current, found, err := r.findByID(ctx, userID, noteID)
	if err != nil {
		return NoteResponse{}, err
	}
	if !found {
		return NoteResponse{}, errNoteNotFound
	}
	response, err := r.resolveContent(ctx, current)
	if err != nil {
		return NoteResponse{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return NoteResponse{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE note_folders
		SET note_ids = array_remove(note_ids, CAST($1 AS uuid)), updated_at = NOW()
		WHERE user_id = $2
	`, noteID, userID); err != nil {
		return NoteResponse{}, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM notes WHERE id = $1 AND user_id = $2`, noteID, userID); err != nil {
		return NoteResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return NoteResponse{}, err
	}

	// Spring과 동일: 커밋 이후에만 오브젝트를 삭제한다.
	_ = r.store.Delete(ctx, current.objectKey)
	return response, nil
}

// contentObjectKey는 Spring NoteService.contentObjectKey와 동일한 키를 만든다
// (clientId는 Java UUID.nameUUIDFromBytes = MD5 기반 v3 UUID로 변환).
func contentObjectKey(userID, noteID string, revision int64, clientID string) string {
	return fmt.Sprintf("note-content/%s/%s/%d-%s.json", userID, noteID, revision, nameUUIDFromBytes([]byte(clientID)))
}

func nameUUIDFromBytes(name []byte) string {
	sum := md5.Sum(name)
	sum[6] = (sum[6] & 0x0f) | 0x30 // version 3
	sum[8] = (sum[8] & 0x3f) | 0x80 // IETF variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", sum[0:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}

func compactJSON(raw json.RawMessage) []byte {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return raw
	}
	return buf.Bytes()
}

// ---- note folders ----

const folderColumns = `id::text, category, name, note_ids::text[], created_at, updated_at`

func scanFolder(row pgx.Row) (FolderResponse, error) {
	var f FolderResponse
	err := row.Scan(&f.ID, &f.Category, &f.Name, &f.NoteIDs, &f.CreatedAt, &f.UpdatedAt)
	if f.NoteIDs == nil {
		f.NoteIDs = []string{}
	}
	return f, err
}

func (r *Repo) ListFolders(ctx context.Context, userID string) ([]FolderResponse, error) {
	rows, err := r.query(ctx, `
		SELECT `+folderColumns+`
		FROM note_folders
		WHERE user_id = $1
		ORDER BY category ASC, name ASC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	folders := make([]FolderResponse, 0)
	for rows.Next() {
		f, err := scanFolder(rows)
		if err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, rows.Err()
}

func (r *Repo) getFolder(ctx context.Context, userID, folderID string) (FolderResponse, error) {
	f, err := scanFolder(r.queryRow(ctx, `
		SELECT `+folderColumns+`
		FROM note_folders
		WHERE id = $1 AND user_id = $2
	`, folderID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, errFolderNotFound
	}
	return f, err
}

// filterOwnedNoteIDs는 소유한 노트 id만 남긴다(Spring과 동일하게 created_at DESC 정렬).
func (r *Repo) filterOwnedNoteIDs(ctx context.Context, userID string, noteIDs []string) ([]string, error) {
	if len(noteIDs) == 0 {
		return []string{}, nil
	}
	rows, err := r.query(ctx, `
		SELECT id::text
		FROM notes
		WHERE user_id = $1 AND id = ANY($2::uuid[])
		ORDER BY created_at DESC
	`, userID, noteIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	owned := make([]string, 0, len(noteIDs))
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		owned = append(owned, id)
	}
	return owned, rows.Err()
}

func (r *Repo) CreateFolder(ctx context.Context, userID string, req FolderCreateRequest) (FolderResponse, error) {
	owned, err := r.filterOwnedNoteIDs(ctx, userID, req.NoteIDs)
	if err != nil {
		return FolderResponse{}, err
	}
	return scanFolder(r.queryRow(ctx, `
		INSERT INTO note_folders (id, user_id, category, name, note_ids)
		VALUES (COALESCE(NULLIF($1, '')::uuid, gen_random_uuid()), $2, $3, $4, $5::uuid[])
		ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
		WHERE note_folders.user_id = EXCLUDED.user_id
		RETURNING `+folderColumns+`
	`, strings.TrimSpace(req.ID), userID, normalizeCategory(req.Category), strings.TrimSpace(req.Name), owned))
}

func (r *Repo) UpdateFolder(ctx context.Context, userID, folderID string, req FolderUpdateRequest) (FolderResponse, error) {
	current, err := r.getFolder(ctx, userID, folderID)
	if err != nil {
		return FolderResponse{}, err
	}
	category := current.Category
	if req.Category != nil {
		category = normalizeCategory(req.Category)
	}
	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	noteIDs := current.NoteIDs
	if req.NoteIDs != nil {
		if noteIDs, err = r.filterOwnedNoteIDs(ctx, userID, *req.NoteIDs); err != nil {
			return FolderResponse{}, err
		}
	}

	f, err := scanFolder(r.queryRow(ctx, `
		UPDATE note_folders
		SET category = $1, name = $2, note_ids = $3::uuid[], updated_at = NOW()
		WHERE id = $4 AND user_id = $5
		RETURNING `+folderColumns+`
	`, category, name, noteIDs, folderID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, errFolderNotFound
	}
	return f, err
}

func (r *Repo) DeleteFolder(ctx context.Context, userID, folderID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM note_folders WHERE id = $1 AND user_id = $2`, folderID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errFolderNotFound
	}
	return nil
}

func (r *Repo) requireOwnedNote(ctx context.Context, userID, noteID string) error {
	var exists bool
	if err := r.queryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM notes WHERE id = $1 AND user_id = $2)
	`, noteID, userID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return errNoteNotFound
	}
	return nil
}

// AddNote는 노트를 다른 폴더에서 제거한 뒤 대상 폴더에 넣는다(폴더당 1소속, Spring과 동일).
func (r *Repo) AddNote(ctx context.Context, userID, folderID, noteID string) (FolderResponse, error) {
	if err := r.requireOwnedNote(ctx, userID, noteID); err != nil {
		return FolderResponse{}, err
	}
	if _, err := r.getFolder(ctx, userID, folderID); err != nil {
		return FolderResponse{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return FolderResponse{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE note_folders
		SET note_ids = array_remove(note_ids, CAST($1 AS uuid)), updated_at = NOW()
		WHERE user_id = $2
	`, noteID, userID); err != nil {
		return FolderResponse{}, err
	}

	f, err := scanFolder(tx.QueryRow(ctx, `
		UPDATE note_folders
		SET note_ids = array_append(note_ids, CAST($1 AS uuid)), updated_at = NOW()
		WHERE id = $2 AND user_id = $3 AND NOT (CAST($1 AS uuid) = ANY(note_ids))
		RETURNING `+folderColumns+`
	`, noteID, folderID, userID))
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return FolderResponse{}, err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return r.getFolder(ctx, userID, folderID)
	}
	return f, nil
}

func (r *Repo) RemoveNote(ctx context.Context, userID, folderID, noteID string) (FolderResponse, error) {
	if _, err := r.getFolder(ctx, userID, folderID); err != nil {
		return FolderResponse{}, err
	}
	f, err := scanFolder(r.queryRow(ctx, `
		UPDATE note_folders
		SET note_ids = array_remove(note_ids, CAST($1 AS uuid)), updated_at = NOW()
		WHERE id = $2 AND user_id = $3
		RETURNING `+folderColumns+`
	`, noteID, folderID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, errFolderNotFound
	}
	return f, err
}

func normalizeCategory(category *string) string {
	if category == nil {
		return ""
	}
	return strings.TrimSpace(*category)
}

// Additive summary/detail contracts; legacy List intentionally retains full bodies.
type noteCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}

func decodeNoteCursor(raw string) (*noteCursor, error) {
	if raw == "" {
		return nil, nil
	}
	if len(raw) > 1024 {
		return nil, httpjson.Errorf(400, "잘못된 노트 cursor입니다.")
	}
	data, err := base64.RawURLEncoding.DecodeString(raw)
	var cursor noteCursor
	if err != nil || json.Unmarshal(data, &cursor) != nil || cursor.CreatedAt.IsZero() || !isUUID(cursor.ID) {
		return nil, httpjson.Errorf(400, "잘못된 노트 cursor입니다.")
	}
	return &cursor, nil
}
func (r *Repo) ListSummary(ctx context.Context, userID string, limit int, rawCursor string) (NoteSummaryPage, error) {
	if limit < 1 || limit > 100 {
		return NoteSummaryPage{}, httpjson.Errorf(400, "limit은 1~100이어야 합니다.")
	}
	cursor, err := decodeNoteCursor(rawCursor)
	if err != nil {
		return NoteSummaryPage{}, err
	}
	var createdAt, id any
	if cursor != nil {
		createdAt, id = cursor.CreatedAt, cursor.ID
	}
	rows, err := r.query(ctx, `
        SELECT id::text, title, created_at, updated_at, revision FROM notes
        WHERE user_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
        ORDER BY created_at DESC, id DESC LIMIT $4
    `, userID, createdAt, id, limit+1)
	if err != nil {
		return NoteSummaryPage{}, err
	}
	defer rows.Close()
	page := NoteSummaryPage{Notes: make([]NoteSummary, 0)}
	for rows.Next() {
		var note NoteSummary
		if err := rows.Scan(&note.ID, &note.Title, &note.CreatedAt, &note.UpdatedAt, &note.Revision); err != nil {
			return NoteSummaryPage{}, err
		}
		page.Notes = append(page.Notes, note)
	}
	if err := rows.Err(); err != nil {
		return NoteSummaryPage{}, err
	}
	if len(page.Notes) > limit {
		last := page.Notes[limit-1]
		encoded, _ := json.Marshal(noteCursor{CreatedAt: last.CreatedAt, ID: last.ID})
		page.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
		page.Notes = page.Notes[:limit]
	}
	return page, nil
}
func (r *Repo) Get(ctx context.Context, userID, noteID string) (NoteResponse, error) {
	note, found, err := r.findByID(ctx, userID, noteID)
	if err != nil {
		return NoteResponse{}, err
	}
	if !found {
		return NoteResponse{}, errNoteNotFound
	}
	return r.resolveContent(ctx, note)
}
