package canvas

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/flownote/flownote-canvas/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repo는 canvas_* 테이블에 대한 데이터 접근을 담당한다. flownote-server(Spring)와
// 동일한 스키마/포맷으로 read/write 하므로 두 서비스가 같은 DB를 안전하게 공유한다.
type Repo struct {
	pool  *pgxpool.Pool
	store *storage.Store
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo {
	return &Repo{pool: pool, store: store}
}

var errNotFound = httpjson.Errorf(http.StatusNotFound, "캔버스를 찾을 수 없습니다.")

// resolveCanvasID는 canvasId가 비면 사용자의 최신 문서를 쓰거나 기본 문서를 만든다.
func (r *Repo) resolveCanvasID(ctx context.Context, userID, canvasID string) (string, error) {
	if strings.TrimSpace(canvasID) != "" {
		return canvasID, nil
	}
	doc, err := r.getOrCreateDefaultDocument(ctx, userID)
	if err != nil {
		return "", err
	}
	return doc.ID, nil
}

func (r *Repo) getOrCreateDefaultDocument(ctx context.Context, userID string) (SummaryResponse, error) {
	var s SummaryResponse
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, title, created_at, updated_at
		FROM canvas_documents
		WHERE user_id = $1
		ORDER BY updated_at DESC, created_at DESC
		LIMIT 1
	`, userID).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return r.CreateDocument(ctx, userID, DocumentRequest{Title: "기본 캔버스"})
	}
	if err != nil {
		return SummaryResponse{}, err
	}
	return s, nil
}

func (r *Repo) requireOwnedCanvas(ctx context.Context, q pgxQuerier, userID, canvasID string) error {
	var exists bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM canvas_documents WHERE id = $1 AND user_id = $2)`, canvasID, userID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return errNotFound
	}
	return nil
}

func (r *Repo) getCanvasRevision(ctx context.Context, q pgxQuerier, userID, canvasID string) (int64, error) {
	var rev int64
	err := q.QueryRow(ctx, `SELECT revision FROM canvas_documents WHERE id = $1 AND user_id = $2`, canvasID, userID).Scan(&rev)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errNotFound
	}
	return rev, err
}

// Metadata는 CanvasMetadataResponse를 반환한다.
func (r *Repo) Metadata(ctx context.Context, userID, canvasID string) (MetadataResponse, error) {
	target, err := r.resolveCanvasID(ctx, userID, canvasID)
	if err != nil {
		return MetadataResponse{}, err
	}
	var m MetadataResponse
	err = r.pool.QueryRow(ctx, `
		SELECT id::text, title, revision, created_at, updated_at
		FROM canvas_documents WHERE id = $1 AND user_id = $2
	`, target, userID).Scan(&m.ID, &m.Title, &m.Revision, &m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return MetadataResponse{}, errNotFound
	}
	return m, err
}

// Elements는 canvas_elements 행을 타입별 배열로 재구성한다. 행이 없으면 문서 JSONB로 폴백.
func (r *Repo) Elements(ctx context.Context, userID, canvasID string) (ElementsResponse, error) {
	started := time.Now()
	target, err := r.resolveCanvasID(ctx, userID, canvasID)
	if err != nil {
		return ElementsResponse{}, err
	}
	if err := r.requireOwnedCanvas(ctx, r.pool, userID, target); err != nil {
		return ElementsResponse{}, err
	}
	revision, err := r.getCanvasRevision(ctx, r.pool, userID, target)
	if err != nil {
		return ElementsResponse{}, err
	}

	lines, images, textBoxes, hasRows, failed, err := r.readElementArrays(ctx, userID, target)
	if err != nil {
		return ElementsResponse{}, err
	}
	if !hasRows {
		canvas, err := r.getStoredCanvasJSON(ctx, userID, target)
		if err != nil {
			return ElementsResponse{}, err
		}
		lines, images, textBoxes = canvas.Lines, canvas.Images, canvas.TextBoxes
	}
	status := "COMPLETE"
	warnings := []string{}
	if failed > 0 {
		status = "PARTIAL"
		warnings = append(warnings, "일부 이전 요소를 불러오지 못했습니다.")
	}
	rev := revision
	return ElementsResponse{
		Lines: lines, Images: images, TextBoxes: textBoxes,
		Revision: &rev, Status: status, Source: "DATABASE",
		FailedElements: []string{}, Warnings: warnings,
		Timings: map[string]int64{"totalMs": time.Since(started).Milliseconds()},
	}, nil
}

// readElementArrays는 canvas_elements를 읽어 타입별 payload 배열을 만든다.
// object_key가 있고 payload가 메타데이터 스텁이면 S3에서 실제 payload를 읽는다(Spring 오프로드 호환).
func (r *Repo) readElementArrays(ctx context.Context, userID, canvasID string) (lines, images, textBoxes json.RawMessage, hasRows bool, failed int, err error) {
	rows, err := r.pool.Query(ctx, `
		SELECT type, payload::text, COALESCE(object_key, '')
		FROM canvas_elements
		WHERE canvas_id = $1 AND user_id = $2
		ORDER BY created_at ASC
	`, canvasID, userID)
	if err != nil {
		return nil, nil, nil, false, 0, err
	}
	defer rows.Close()

	var lineParts, imageParts, textParts []json.RawMessage
	count := 0
	for rows.Next() {
		var etype, payload, objectKey string
		if err := rows.Scan(&etype, &payload, &objectKey); err != nil {
			return nil, nil, nil, false, 0, err
		}
		count++
		raw := json.RawMessage(payload)
		if objectKey != "" && isMetadataStub(raw) {
			loaded, ok := r.loadPayloadFromStorage(ctx, objectKey)
			if !ok {
				failed++
				continue
			}
			raw = loaded
		}
		switch etype {
		case "line":
			lineParts = append(lineParts, raw)
		case "image":
			imageParts = append(imageParts, raw)
		case "textBox":
			textParts = append(textParts, raw)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, false, 0, err
	}
	return joinArray(lineParts), joinArray(imageParts), joinArray(textParts), count > 0, failed, nil
}

func (r *Repo) loadPayloadFromStorage(ctx context.Context, objectKey string) (json.RawMessage, bool) {
	if r.store == nil || !r.store.Configured() {
		return nil, false
	}
	obj, err := r.store.Get(ctx, objectKey)
	if err != nil {
		return nil, false
	}
	if !json.Valid(obj.Data) {
		return nil, false
	}
	return json.RawMessage(obj.Data), true
}

func (r *Repo) getStoredCanvasJSON(ctx context.Context, userID, canvasID string) (CanvasResponse, error) {
	var c CanvasResponse
	var lines, images, textBoxes string
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, title, lines::text, images::text, text_boxes::text
		FROM canvas_documents WHERE id = $1 AND user_id = $2
	`, canvasID, userID).Scan(&c.ID, &c.Title, &lines, &images, &textBoxes)
	if errors.Is(err, pgx.ErrNoRows) {
		return CanvasResponse{}, errNotFound
	}
	if err != nil {
		return CanvasResponse{}, err
	}
	c.Lines, c.Images, c.TextBoxes = json.RawMessage(lines), json.RawMessage(images), json.RawMessage(textBoxes)
	return c, nil
}

// Load는 CanvasResponse(문서 + 요소 병합)를 반환한다.
func (r *Repo) Load(ctx context.Context, userID, canvasID string) (CanvasResponse, error) {
	target, err := r.resolveCanvasID(ctx, userID, canvasID)
	if err != nil {
		return CanvasResponse{}, err
	}
	stored, err := r.getStoredCanvasJSON(ctx, userID, target)
	if err != nil {
		return CanvasResponse{}, err
	}
	lines, images, textBoxes, hasRows, _, err := r.readElementArrays(ctx, userID, target)
	if err != nil {
		return CanvasResponse{}, err
	}
	if hasRows {
		stored.Lines, stored.Images, stored.TextBoxes = lines, images, textBoxes
	}
	return stored, nil
}

// SaveElements는 증분 저장을 트랜잭션 + advisory lock + mutation 멱등성으로 처리한다.
// Go는 payload를 인라인(object_key=NULL, storage_status='READY')으로 저장한다.
func (r *Repo) SaveElements(ctx context.Context, userID, canvasID string, req SaveRequest) (SaveResponse, error) {
	if strings.TrimSpace(req.MutationID) == "" {
		return SaveResponse{}, httpjson.Errorf(http.StatusBadRequest, "mutationId가 필요합니다.")
	}
	target, err := r.resolveCanvasID(ctx, userID, canvasID)
	if err != nil {
		return SaveResponse{}, err
	}
	payloadHash := hashSaveRequest(req)

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return SaveResponse{}, err
	}
	defer tx.Rollback(ctx)

	if err := r.requireOwnedCanvas(ctx, tx, userID, target); err != nil {
		return SaveResponse{}, err
	}
	// user+canvas 조합에 대한 트랜잭션 advisory lock (Spring과 동일 키 규칙).
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, userID, target); err != nil {
		return SaveResponse{}, err
	}

	// 멱등성: 동일 mutationId 재요청 처리.
	var existHash, existStatus string
	var existRev *int64
	err = tx.QueryRow(ctx, `
		SELECT payload_hash, status, result_revision
		FROM canvas_mutations WHERE canvas_id = $1 AND mutation_id = $2 AND user_id = $3
	`, target, req.MutationID, userID).Scan(&existHash, &existStatus, &existRev)
	if err == nil {
		if existHash != payloadHash {
			return SaveResponse{}, httpjson.Errorf(http.StatusConflict, "동일한 mutationId에 다른 저장 내용이 전달되었습니다.")
		}
		if existStatus != "COMPLETED" || existRev == nil {
			return SaveResponse{}, httpjson.Errorf(http.StatusConflict, "동일한 저장 요청이 아직 처리 중입니다.")
		}
		return SaveResponse{MutationID: req.MutationID, Revision: *existRev, Duplicate: true, StorageStatus: "READY"}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SaveResponse{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO canvas_mutations (canvas_id, mutation_id, user_id, payload_hash, status)
		VALUES ($1, $2, $3, $4, 'PROCESSING')
	`, target, req.MutationID, userID, payloadHash); err != nil {
		return SaveResponse{}, err
	}

	if !hasChanges(req) {
		rev, err := r.getCanvasRevision(ctx, tx, userID, target)
		if err != nil {
			return SaveResponse{}, err
		}
		if err := completeMutation(ctx, tx, target, req.MutationID, userID, rev); err != nil {
			return SaveResponse{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return SaveResponse{}, err
		}
		return SaveResponse{MutationID: req.MutationID, Revision: rev, Duplicate: false, StorageStatus: "READY"}, nil
	}

	// 삭제 먼저, 그다음 추가/수정 upsert.
	for _, d := range []struct {
		etype string
		arr   json.RawMessage
	}{{"line", req.DeletedLines}, {"image", req.DeletedImages}, {"textBox", req.DeletedTextBoxes}} {
		if err := deleteElements(ctx, tx, userID, target, d.etype, d.arr); err != nil {
			return SaveResponse{}, err
		}
	}
	for _, u := range []struct {
		etype string
		arr   json.RawMessage
	}{
		{"line", req.AddedLines}, {"line", req.ModifiedLines},
		{"image", req.AddedImages}, {"image", req.ModifiedImages},
		{"textBox", req.AddedTextBoxes}, {"textBox", req.ModifiedTextBoxes},
	} {
		if err := upsertElements(ctx, tx, userID, target, u.etype, u.arr); err != nil {
			return SaveResponse{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE canvas_documents
		SET lines = '[]'::jsonb, images = '[]'::jsonb, text_boxes = '[]'::jsonb,
		    revision = revision + 1, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, target, userID); err != nil {
		return SaveResponse{}, err
	}

	rev, err := r.getCanvasRevision(ctx, tx, userID, target)
	if err != nil {
		return SaveResponse{}, err
	}
	if err := completeMutation(ctx, tx, target, req.MutationID, userID, rev); err != nil {
		return SaveResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SaveResponse{}, err
	}
	return SaveResponse{MutationID: req.MutationID, Revision: rev, Duplicate: false, StorageStatus: "READY"}, nil
}

func completeMutation(ctx context.Context, tx pgx.Tx, canvasID, mutationID, userID string, revision int64) error {
	_, err := tx.Exec(ctx, `
		UPDATE canvas_mutations SET status = 'COMPLETED', result_revision = $1, completed_at = NOW()
		WHERE canvas_id = $2 AND mutation_id = $3 AND user_id = $4
	`, revision, canvasID, mutationID, userID)
	return err
}

func deleteElements(ctx context.Context, tx pgx.Tx, userID, canvasID, etype string, arr json.RawMessage) error {
	ids := elementIDs(arr)
	if len(ids) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		DELETE FROM canvas_elements
		WHERE canvas_id = $1 AND user_id = $2 AND type = $3 AND id = ANY($4)
	`, canvasID, userID, etype, ids)
	return err
}

func upsertElements(ctx context.Context, tx pgx.Tx, userID, canvasID, etype string, arr json.RawMessage) error {
	elements := decodeArray(arr)
	for _, el := range elements {
		id := elementID(el)
		if id == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO canvas_elements (id, canvas_id, user_id, type, payload, object_key, storage_status)
			VALUES ($1, $2, $3, $4, $5::jsonb, NULL, 'READY')
			ON CONFLICT (canvas_id, id) DO UPDATE SET
				type = EXCLUDED.type,
				payload = EXCLUDED.payload,
				object_key = NULL,
				storage_status = 'READY',
				storage_error_code = NULL,
				updated_at = NOW()
		`, id, canvasID, userID, etype, string(el)); err != nil {
			return err
		}
	}
	return nil
}

// Viewport는 사용자별 뷰포트를 반환한다(없으면 기본값).
func (r *Repo) Viewport(ctx context.Context, userID, canvasID string) (ViewportResponse, error) {
	target, err := r.resolveCanvasID(ctx, userID, canvasID)
	if err != nil {
		return ViewportResponse{}, err
	}
	if err := r.requireOwnedCanvas(ctx, r.pool, userID, target); err != nil {
		return ViewportResponse{}, err
	}
	var v ViewportResponse
	err = r.pool.QueryRow(ctx, `
		SELECT canvas_id::text, offset_x, offset_y, scale, updated_at
		FROM canvas_viewports WHERE canvas_id = $1 AND user_id = $2
	`, target, userID).Scan(&v.CanvasID, &v.OffsetX, &v.OffsetY, &v.Scale, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ViewportResponse{CanvasID: target, OffsetX: 0, OffsetY: 0, Scale: 1, UpdatedAt: time.Now()}, nil
	}
	return v, err
}

// SaveViewport는 뷰포트를 upsert 한다.
func (r *Repo) SaveViewport(ctx context.Context, userID, canvasID string, req ViewportRequest) (ViewportResponse, error) {
	if err := r.requireOwnedCanvas(ctx, r.pool, userID, canvasID); err != nil {
		return ViewportResponse{}, err
	}
	scale := req.Scale
	if scale <= 0 {
		scale = 1
	}
	var v ViewportResponse
	err := r.pool.QueryRow(ctx, `
		INSERT INTO canvas_viewports (canvas_id, user_id, offset_x, offset_y, scale)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (canvas_id, user_id) DO UPDATE SET
			offset_x = EXCLUDED.offset_x, offset_y = EXCLUDED.offset_y,
			scale = EXCLUDED.scale, updated_at = NOW()
		RETURNING canvas_id::text, offset_x, offset_y, scale, updated_at
	`, canvasID, userID, req.OffsetX, req.OffsetY, scale).Scan(&v.CanvasID, &v.OffsetX, &v.OffsetY, &v.Scale, &v.UpdatedAt)
	return v, err
}

// ---- 문서(document) ----

func (r *Repo) ListDocuments(ctx context.Context, userID string) ([]SummaryResponse, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, title, created_at, updated_at FROM canvas_documents
		WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []SummaryResponse{}
	for rows.Next() {
		var s SummaryResponse
		if err := rows.Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

func (r *Repo) CreateDocument(ctx context.Context, userID string, req DocumentRequest) (SummaryResponse, error) {
	var s SummaryResponse
	err := r.pool.QueryRow(ctx, `
		INSERT INTO canvas_documents (id, user_id, title, lines, images, text_boxes)
		VALUES (gen_random_uuid(), $1, $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
		RETURNING id::text, title, created_at, updated_at
	`, userID, normalizeTitle(req.Title)).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (r *Repo) UpdateDocument(ctx context.Context, userID, canvasID string, req DocumentRequest) (SummaryResponse, error) {
	var s SummaryResponse
	err := r.pool.QueryRow(ctx, `
		UPDATE canvas_documents SET title = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
		RETURNING id::text, title, created_at, updated_at
	`, normalizeTitle(req.Title), canvasID, userID).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return SummaryResponse{}, errNotFound
	}
	return s, err
}

func (r *Repo) DeleteDocument(ctx context.Context, userID, canvasID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `DELETE FROM canvas_documents WHERE id = $1 AND user_id = $2`, canvasID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	if _, err := tx.Exec(ctx, `
		UPDATE canvas_folders SET canvas_ids = array_remove(canvas_ids, $1::uuid), updated_at = NOW()
		WHERE user_id = $2
	`, canvasID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---- 폴더(folder) ----

func (r *Repo) ListFolders(ctx context.Context, userID string) ([]FolderResponse, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, category, name, canvas_ids::text[], created_at, updated_at
		FROM canvas_folders WHERE user_id = $1 ORDER BY category ASC, name ASC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []FolderResponse{}
	for rows.Next() {
		f := FolderResponse{CanvasIDs: []string{}}
		if err := rows.Scan(&f.ID, &f.Category, &f.Name, &f.CanvasIDs, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		if f.CanvasIDs == nil {
			f.CanvasIDs = []string{}
		}
		list = append(list, f)
	}
	return list, rows.Err()
}

func (r *Repo) getFolder(ctx context.Context, userID, folderID string) (FolderResponse, error) {
	f := FolderResponse{CanvasIDs: []string{}}
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, category, name, canvas_ids::text[], created_at, updated_at
		FROM canvas_folders WHERE id = $1 AND user_id = $2
	`, folderID, userID).Scan(&f.ID, &f.Category, &f.Name, &f.CanvasIDs, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, httpjson.Errorf(http.StatusNotFound, "캔버스 폴더를 찾을 수 없습니다.")
	}
	return f, err
}

func (r *Repo) filterOwnedCanvasIDs(ctx context.Context, userID string, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return []string{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id::text FROM canvas_documents WHERE user_id = $1 AND id = ANY($2::uuid[])
	`, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	owned := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		owned = append(owned, id)
	}
	return owned, rows.Err()
}

func (r *Repo) CreateFolder(ctx context.Context, userID string, req FolderRequest) (FolderResponse, error) {
	owned, err := r.filterOwnedCanvasIDs(ctx, userID, req.CanvasIDs)
	if err != nil {
		return FolderResponse{}, err
	}
	f := FolderResponse{CanvasIDs: []string{}}
	err = r.pool.QueryRow(ctx, `
		INSERT INTO canvas_folders (id, user_id, category, name, canvas_ids)
		VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid[])
		RETURNING id::text, category, name, canvas_ids::text[], created_at, updated_at
	`, userID, normalizeCategory(deref(req.Category)), normalizeFolderName(deref(req.Name)), owned).
		Scan(&f.ID, &f.Category, &f.Name, &f.CanvasIDs, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (r *Repo) UpdateFolder(ctx context.Context, userID, folderID string, req FolderRequest) (FolderResponse, error) {
	current, err := r.getFolder(ctx, userID, folderID)
	if err != nil {
		return FolderResponse{}, err
	}
	category := current.Category
	if req.Category != nil {
		category = normalizeCategory(*req.Category)
	}
	name := current.Name
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		name = strings.TrimSpace(*req.Name)
	}
	canvasIDs := current.CanvasIDs
	if req.CanvasIDs != nil {
		canvasIDs, err = r.filterOwnedCanvasIDs(ctx, userID, req.CanvasIDs)
		if err != nil {
			return FolderResponse{}, err
		}
	}
	f := FolderResponse{CanvasIDs: []string{}}
	err = r.pool.QueryRow(ctx, `
		UPDATE canvas_folders SET category = $1, name = $2, canvas_ids = $3::uuid[], updated_at = NOW()
		WHERE id = $4 AND user_id = $5
		RETURNING id::text, category, name, canvas_ids::text[], created_at, updated_at
	`, category, name, canvasIDs, folderID, userID).Scan(&f.ID, &f.Category, &f.Name, &f.CanvasIDs, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, httpjson.Errorf(http.StatusNotFound, "캔버스 폴더를 찾을 수 없습니다.")
	}
	return f, err
}

func (r *Repo) DeleteFolder(ctx context.Context, userID, folderID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM canvas_folders WHERE id = $1 AND user_id = $2`, folderID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpjson.Errorf(http.StatusNotFound, "캔버스 폴더를 찾을 수 없습니다.")
	}
	return nil
}

func (r *Repo) AddDocumentToFolder(ctx context.Context, userID, folderID, canvasID string) (FolderResponse, error) {
	if err := r.requireOwnedCanvas(ctx, r.pool, userID, canvasID); err != nil {
		return FolderResponse{}, err
	}
	if _, err := r.getFolder(ctx, userID, folderID); err != nil {
		return FolderResponse{}, err
	}
	if _, err := r.pool.Exec(ctx, `
		UPDATE canvas_folders SET canvas_ids = array_remove(canvas_ids, $1::uuid), updated_at = NOW()
		WHERE user_id = $2
	`, canvasID, userID); err != nil {
		return FolderResponse{}, err
	}
	if _, err := r.pool.Exec(ctx, `
		UPDATE canvas_folders SET canvas_ids = array_append(canvas_ids, $1::uuid), updated_at = NOW()
		WHERE id = $2 AND user_id = $3 AND NOT ($1::uuid = ANY(canvas_ids))
	`, canvasID, folderID, userID); err != nil {
		return FolderResponse{}, err
	}
	return r.getFolder(ctx, userID, folderID)
}

func (r *Repo) RemoveDocumentFromFolder(ctx context.Context, userID, folderID, canvasID string) (FolderResponse, error) {
	if _, err := r.getFolder(ctx, userID, folderID); err != nil {
		return FolderResponse{}, err
	}
	f := FolderResponse{CanvasIDs: []string{}}
	err := r.pool.QueryRow(ctx, `
		UPDATE canvas_folders SET canvas_ids = array_remove(canvas_ids, $1::uuid), updated_at = NOW()
		WHERE id = $2 AND user_id = $3
		RETURNING id::text, category, name, canvas_ids::text[], created_at, updated_at
	`, canvasID, folderID, userID).Scan(&f.ID, &f.Category, &f.Name, &f.CanvasIDs, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FolderResponse{}, httpjson.Errorf(http.StatusNotFound, "캔버스 폴더를 찾을 수 없습니다.")
	}
	return f, err
}

// ---- 자산(asset) ----

// InsertAsset은 canvas_assets 행을 추가하고 asset id를 돌려준다.
func (r *Repo) InsertAsset(ctx context.Context, userID, objectKey, contentType string, byteSize int64) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO canvas_assets (id, user_id, object_key, content_type, byte_size)
		VALUES (gen_random_uuid(), $1, $2, $3, $4)
		RETURNING id::text
	`, userID, objectKey, contentType, byteSize).Scan(&id)
	return id, err
}

// AssetByID는 asset id로 object_key/content_type을 조회한다.
func (r *Repo) AssetByID(ctx context.Context, assetID string) (objectKey, contentType string, byteSize int64, err error) {
	err = r.pool.QueryRow(ctx, `
		SELECT object_key, content_type, byte_size FROM canvas_assets WHERE id = $1
	`, assetID).Scan(&objectKey, &contentType, &byteSize)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", 0, httpjson.Errorf(http.StatusNotFound, "이미지를 찾을 수 없습니다.")
	}
	return objectKey, contentType, byteSize, err
}

// ---- 헬퍼 ----

// pgxQuerier는 pool과 tx를 함께 받기 위한 최소 인터페이스다.
type pgxQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func joinArray(parts []json.RawMessage) json.RawMessage {
	if len(parts) == 0 {
		return emptyArray
	}
	out := make([]byte, 0, 64)
	out = append(out, '[')
	for i, p := range parts {
		if i > 0 {
			out = append(out, ',')
		}
		out = append(out, p...)
	}
	out = append(out, ']')
	return out
}

func decodeArray(arr json.RawMessage) []json.RawMessage {
	if len(arr) == 0 {
		return nil
	}
	var out []json.RawMessage
	if err := json.Unmarshal(arr, &out); err != nil {
		return nil
	}
	return out
}

func elementIDs(arr json.RawMessage) []string {
	elements := decodeArray(arr)
	ids := make([]string, 0, len(elements))
	for _, el := range elements {
		if id := elementID(el); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func elementID(el json.RawMessage) string {
	var obj struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(el, &obj); err != nil {
		return ""
	}
	return obj.ID
}

// isMetadataStub는 payload가 Spring이 S3로 오프로드하며 남긴 메타데이터 스텁인지 본다.
func isMetadataStub(raw json.RawMessage) bool {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return false
	}
	_, hasID := m["id"]
	_, hasObjectKey := m["objectKey"]
	return len(m) <= 3 && hasID && hasObjectKey
}

func hasChanges(req SaveRequest) bool {
	for _, a := range []json.RawMessage{
		req.AddedLines, req.ModifiedLines, req.DeletedLines,
		req.AddedImages, req.ModifiedImages, req.DeletedImages,
		req.AddedTextBoxes, req.ModifiedTextBoxes, req.DeletedTextBoxes,
	} {
		if len(decodeArray(a)) > 0 {
			return true
		}
	}
	return false
}

func hashSaveRequest(req SaveRequest) string {
	h := sha256.New()
	for _, a := range []json.RawMessage{
		req.AddedLines, req.ModifiedLines, req.DeletedLines,
		req.AddedImages, req.ModifiedImages, req.DeletedImages,
		req.AddedTextBoxes, req.ModifiedTextBoxes, req.DeletedTextBoxes,
	} {
		h.Write(a)
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func normalizeTitle(title string) string {
	t := strings.TrimSpace(title)
	if t == "" {
		return "기본 캔버스"
	}
	return t
}

func normalizeCategory(category string) string {
	return strings.TrimSpace(category)
}

func normalizeFolderName(name string) string {
	n := strings.TrimSpace(name)
	if n == "" {
		return "새 폴더"
	}
	return n
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
