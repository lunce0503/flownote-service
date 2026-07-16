package task

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/httpjson"
	"github.com/flownote/flownote-serve/internal/storage"
)

// Spring TaskController/Service/Repository(/api/tasks) 이식.
// 계약: 응답 snake_case(jackson SNAKE_CASE), 날짜는 "YYYY-MM-DD", PATCH 본문도 snake_case 키,
// memo/links/time_logs는 S3 오프로드(작업당 고정 키 덮어쓰기).

type TimeLog struct {
	ID            string `json:"id"`
	Label         string `json:"label"`
	Minutes       *int   `json:"minutes,omitempty"`
	PerformedDate string `json:"performed_date"`
}

type Task struct {
	ID               string    `json:"id"`
	TaskName         string    `json:"task_name"`
	Category         *string   `json:"category,omitempty"`
	DifficultyLevel  *int      `json:"difficulty_level,omitempty"`
	Status           *string   `json:"status,omitempty"`
	EstimatedMinutes *int      `json:"estimated_minutes,omitempty"`
	ActualMinutes    *int      `json:"actual_minutes,omitempty"`
	DueDate          *string   `json:"due_date,omitempty"`
	Memo             *string   `json:"memo,omitempty"`
	Tags             []string  `json:"tags"`
	Links            []string  `json:"links"`
	TimeLogs         []TimeLog `json:"time_logs"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type createRequest struct {
	ID               string          `json:"id"`
	TaskName         *string         `json:"task_name"`
	Category         *string         `json:"category"`
	DifficultyLevel  *int            `json:"difficulty_level"`
	Status           *string         `json:"status"`
	EstimatedMinutes *int            `json:"estimated_minutes"`
	ActualMinutes    *int            `json:"actual_minutes"`
	DueDate          *string         `json:"due_date"`
	Memo             *string         `json:"memo"`
	Tags             []string        `json:"tags"`
	Links            []string        `json:"links"`
	TimeLogs         json.RawMessage `json:"time_logs"`
}

type Repo struct {
	pool  *pgxpool.Pool
	store *storage.Store
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo { return &Repo{pool: pool, store: store} }

const taskColumns = `id, task_name, category, difficulty_level, status,
	estimated_minutes, actual_minutes, to_char(due_date,'YYYY-MM-DD'), memo, tags,
	COALESCE(memo_object_key,''), links, COALESCE(links_object_key,''),
	time_logs::text, COALESCE(time_logs_object_key,''), created_at, updated_at`

func (r *Repo) scanTask(ctx context.Context, row pgx.Row) (Task, error) {
	var t Task
	var memo *string
	var memoKey, linksKey, timeLogsText, timeLogsKey string
	err := row.Scan(&t.ID, &t.TaskName, &t.Category, &t.DifficultyLevel, &t.Status,
		&t.EstimatedMinutes, &t.ActualMinutes, &t.DueDate, &memo, &t.Tags,
		&memoKey, &t.Links, &linksKey, &timeLogsText, &timeLogsKey, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return Task{}, err
	}
	if t.Tags == nil {
		t.Tags = []string{}
	}
	if t.Links == nil {
		t.Links = []string{}
	}

	t.Memo = memo
	if memoKey != "" {
		if obj, err := r.store.Get(ctx, memoKey); err == nil {
			s := string(obj.Data)
			t.Memo = &s
		}
	}
	if linksKey != "" {
		if obj, err := r.store.Get(ctx, linksKey); err == nil {
			var links []string
			if json.Unmarshal(obj.Data, &links) == nil {
				t.Links = links
			} else {
				t.Links = []string{}
			}
		}
	}
	rawTimeLogs := timeLogsText
	if timeLogsKey != "" {
		if obj, err := r.store.Get(ctx, timeLogsKey); err == nil {
			rawTimeLogs = string(obj.Data)
		}
	}
	t.TimeLogs = parseTimeLogs(rawTimeLogs)
	return t, nil
}

func parseTimeLogs(raw string) []TimeLog {
	logs := make([]TimeLog, 0)
	if strings.TrimSpace(raw) == "" {
		return logs
	}
	var entries []map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &entries) != nil {
		return logs
	}
	for _, entry := range entries {
		logs = append(logs, normalizeTimeLog(entry))
	}
	return logs
}

// normalizeTimeLog는 Spring TaskService.toTimeLogs와 동일한 관용 규칙을 적용한다
// (performed_date/performedDate 모두 허용, 기본값 채움).
func normalizeTimeLog(entry map[string]json.RawMessage) TimeLog {
	str := func(key, fallback string) string {
		if raw, ok := entry[key]; ok {
			var s string
			if json.Unmarshal(raw, &s) == nil && s != "" {
				return s
			}
		}
		return fallback
	}
	minutes := 0
	if raw, ok := entry["minutes"]; ok {
		_ = json.Unmarshal(raw, &minutes)
	}
	performed := str("performed_date", "")
	if performed == "" {
		performed = str("performedDate", "")
	}
	if performed == "" {
		performed = time.Now().Format("2006-01-02")
	}
	return TimeLog{
		ID:            str("id", storage.NewUUID()),
		Label:         str("label", ""),
		Minutes:       &minutes,
		PerformedDate: performed,
	}
}

func (r *Repo) storeText(ctx context.Context, userID, taskID, name, contentType string, data []byte) (string, string, int, error) {
	objectKey := fmt.Sprintf("task-payloads/%s/%s/%s", userID, taskID, name)
	publicURL, err := r.store.Put(ctx, objectKey, contentType, data)
	if err != nil {
		return "", "", 0, err
	}
	return objectKey, publicURL, len(data), nil
}

func normalizeTextArray(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func marshalTimeLogs(raw json.RawMessage) []byte {
	logs := make([]TimeLog, 0)
	if len(raw) > 0 {
		var entries []map[string]json.RawMessage
		if json.Unmarshal(raw, &entries) == nil {
			for _, entry := range entries {
				logs = append(logs, normalizeTimeLog(entry))
			}
		}
	}
	data, err := json.Marshal(logs)
	if err != nil {
		return []byte("[]")
	}
	return data
}

func (r *Repo) FindAll(ctx context.Context, userID string) ([]Task, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+taskColumns+`
		FROM tasks
		WHERE user_id = $1
		ORDER BY due_date ASC NULLS LAST, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := make([]Task, 0)
	for rows.Next() {
		t, err := r.scanTask(ctx, rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (r *Repo) Create(ctx context.Context, userID string, req createRequest) (Task, error) {
	id := strings.TrimSpace(req.ID)
	if id == "" {
		id = storage.NewUUID()
	}
	taskName := ""
	if req.TaskName != nil {
		taskName = *req.TaskName
	}
	memo := ""
	if req.Memo != nil {
		memo = *req.Memo
	}
	memoKey, memoURL, memoSize, err := r.storeText(ctx, userID, id, "memo.txt", "text/plain; charset=utf-8", []byte(memo))
	if err != nil {
		return Task{}, err
	}
	linksJSON, _ := json.Marshal(normalizeTextArray(req.Links))
	linksKey, linksURL, linksSize, err := r.storeText(ctx, userID, id, "links.json", "application/json", linksJSON)
	if err != nil {
		return Task{}, err
	}
	timeLogsJSON := marshalTimeLogs(req.TimeLogs)
	logsKey, logsURL, logsSize, err := r.storeText(ctx, userID, id, "time-logs.json", "application/json", timeLogsJSON)
	if err != nil {
		return Task{}, err
	}

	return r.scanTask(ctx, r.pool.QueryRow(ctx, `
		INSERT INTO tasks (
			id, user_id, task_name, category, difficulty_level, status,
			estimated_minutes, actual_minutes, due_date, memo, memo_object_key, memo_byte_size, memo_public_url,
			tags, links, links_object_key, links_byte_size, links_public_url,
			time_logs, time_logs_object_key, time_logs_byte_size, time_logs_public_url
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, '', $10, $11, $12,
			$13, ARRAY[]::TEXT[], $14, $15, $16, '[]'::jsonb, $17, $18, $19)
		RETURNING `+taskColumns,
		id, userID, taskName, req.Category, req.DifficultyLevel, req.Status,
		req.EstimatedMinutes, req.ActualMinutes, req.DueDate,
		memoKey, memoSize, memoURL,
		normalizeTextArray(req.Tags),
		linksKey, linksSize, linksURL,
		logsKey, logsSize, logsURL))
}

// Update는 본문에 온 snake_case 필드만 동적으로 갱신한다(Spring TaskService.update와 동일).
func (r *Repo) Update(ctx context.Context, userID, id string, body map[string]json.RawMessage) (Task, bool, error) {
	assignments := make([]string, 0, 8)
	values := make([]any, 0, 12)
	next := func(v any) string {
		values = append(values, v)
		return fmt.Sprintf("$%d", len(values))
	}

	for _, key := range []string{"task_name", "category", "difficulty_level", "status",
		"estimated_minutes", "actual_minutes", "due_date", "memo", "tags", "links", "time_logs"} {
		raw, ok := body[key]
		if !ok {
			continue
		}
		switch key {
		case "memo":
			memo := ""
			_ = json.Unmarshal(raw, &memo)
			objectKey, publicURL, byteSize, err := r.storeText(ctx, userID, id, "memo.txt", "text/plain; charset=utf-8", []byte(memo))
			if err != nil {
				return Task{}, false, err
			}
			assignments = append(assignments, "memo = ''",
				"memo_object_key = "+next(objectKey),
				"memo_byte_size = "+next(byteSize),
				"memo_public_url = "+next(publicURL))
		case "links":
			var links []string
			_ = json.Unmarshal(raw, &links)
			linksJSON, _ := json.Marshal(normalizeTextArray(links))
			objectKey, publicURL, byteSize, err := r.storeText(ctx, userID, id, "links.json", "application/json", linksJSON)
			if err != nil {
				return Task{}, false, err
			}
			assignments = append(assignments, "links = ARRAY[]::TEXT[]",
				"links_object_key = "+next(objectKey),
				"links_byte_size = "+next(byteSize),
				"links_public_url = "+next(publicURL))
		case "time_logs":
			timeLogsJSON := marshalTimeLogs(raw)
			objectKey, publicURL, byteSize, err := r.storeText(ctx, userID, id, "time-logs.json", "application/json", timeLogsJSON)
			if err != nil {
				return Task{}, false, err
			}
			assignments = append(assignments, "time_logs = '[]'::jsonb",
				"time_logs_object_key = "+next(objectKey),
				"time_logs_byte_size = "+next(byteSize),
				"time_logs_public_url = "+next(publicURL))
		case "difficulty_level", "estimated_minutes", "actual_minutes":
			var v *int
			_ = json.Unmarshal(raw, &v)
			assignments = append(assignments, key+" = "+next(v))
		case "due_date":
			var v *string
			_ = json.Unmarshal(raw, &v)
			assignments = append(assignments, key+" = "+next(v)+"::date")
		case "tags":
			var tags []string
			_ = json.Unmarshal(raw, &tags)
			assignments = append(assignments, "tags = "+next(normalizeTextArray(tags)))
		default:
			var s *string
			_ = json.Unmarshal(raw, &s)
			assignments = append(assignments, key+" = "+next(s))
		}
	}
	if len(assignments) == 0 {
		return Task{}, false, nil
	}

	sql := fmt.Sprintf(`
		UPDATE tasks
		SET %s, updated_at = NOW()
		WHERE id = %s AND user_id = %s
		RETURNING `+taskColumns, strings.Join(assignments, ", "), next(id), next(userID))

	t, err := r.scanTask(ctx, r.pool.QueryRow(ctx, sql, values...))
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, false, nil
	}
	if err != nil {
		return Task{}, false, err
	}
	return t, true, nil
}

func (r *Repo) Delete(ctx context.Context, userID, id string) (Task, bool, error) {
	t, err := r.scanTask(ctx, r.pool.QueryRow(ctx, `
		DELETE FROM tasks
		WHERE id = $1 AND user_id = $2
		RETURNING `+taskColumns, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Task{}, false, nil
	}
	if err != nil {
		return Task{}, false, err
	}
	return t, true, nil
}

// ---- handler ----

type Handler struct {
	repo *Repo
	auth *auth.Authenticator
}

func NewHandler(repo *Repo, authenticator *auth.Authenticator) *Handler {
	return &Handler{repo: repo, auth: authenticator}
}

func (h *Handler) Register(mux *http.ServeMux) {
	p := func(fn http.HandlerFunc) http.Handler { return h.auth.Middleware(fn) }
	mux.Handle("GET /api/tasks", p(h.list))
	mux.Handle("POST /api/tasks", p(h.create))
	mux.Handle("PATCH /api/tasks/{id}", p(h.update))
	mux.Handle("DELETE /api/tasks/{id}", p(h.delete))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	tasks, err := h.repo.FindAll(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, tasks)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "작업 데이터가 필요합니다."))
		return
	}
	created, err := h.repo.Create(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/tasks/"+created.ID)
	httpjson.Write(w, http.StatusCreated, created)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	t, found, err := h.repo.Update(r.Context(), auth.UserID(r.Context()), r.PathValue("id"), body)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":     "성공적으로 업데이트되었습니다.",
		"updatedTask": t,
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	t, found, err := h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("id"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":     "성공적으로 삭제되었습니다.",
		"deletedTask": t,
	})
}
