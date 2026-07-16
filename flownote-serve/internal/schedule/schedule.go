package schedule

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

// Spring ScheduleController/Service/Repository(/api/schedule-items) 이식.
// 계약: 응답 snake_case(jackson SNAKE_CASE와 동일), 시간은 "HH:MM:SS", 메모는 S3 오프로드.

var validDays = map[string]bool{"MON": true, "TUE": true, "WED": true, "THU": true, "FRI": true, "SAT": true, "SUN": true}

type Item struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	DaysOfWeek []string `json:"days_of_week"`
	StartTime  string   `json:"start_time"`
	EndTime    string   `json:"end_time"`
	Category   *string  `json:"category,omitempty"`
	Color      string   `json:"color"`
	Memo       string   `json:"memo"`
	IsActive   bool     `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// 요청은 camelCase(프론트 정규화)와 snake_case(레거시) 키를 모두 받는다.
type itemRequest struct {
	Title       string   `json:"title"`
	DaysOfWeek  []string `json:"daysOfWeek"`
	DaysSnake   []string `json:"days_of_week"`
	StartTime   string   `json:"startTime"`
	StartSnake  string   `json:"start_time"`
	EndTime     string   `json:"endTime"`
	EndSnake    string   `json:"end_time"`
	Category    *string  `json:"category"`
	Color       string   `json:"color"`
	Memo        *string  `json:"memo"`
	IsActive    *bool    `json:"isActive"`
	ActiveSnake *bool    `json:"is_active"`
}

func (r itemRequest) days() []string {
	if r.DaysOfWeek != nil {
		return r.DaysOfWeek
	}
	return r.DaysSnake
}
func (r itemRequest) start() string { return firstNonEmpty(r.StartTime, r.StartSnake) }
func (r itemRequest) end() string   { return firstNonEmpty(r.EndTime, r.EndSnake) }
func (r itemRequest) active() *bool {
	if r.IsActive != nil {
		return r.IsActive
	}
	return r.ActiveSnake
}

type Repo struct {
	pool  *pgxpool.Pool
	store *storage.Store
}

func NewRepo(pool *pgxpool.Pool, store *storage.Store) *Repo { return &Repo{pool: pool, store: store} }

const itemColumns = `id::text, title, days_of_week, to_char(start_time,'HH24:MI:SS'), to_char(end_time,'HH24:MI:SS'), category, color, memo, COALESCE(memo_object_key,''), is_active, created_at, updated_at`

func (r *Repo) scanItem(ctx context.Context, row pgx.Row) (Item, error) {
	var item Item
	var memo, memoKey string
	err := row.Scan(&item.ID, &item.Title, &item.DaysOfWeek, &item.StartTime, &item.EndTime,
		&item.Category, &item.Color, &memo, &memoKey, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Item{}, err
	}
	if item.DaysOfWeek == nil {
		item.DaysOfWeek = []string{}
	}
	item.Memo = memo
	if memoKey != "" {
		if obj, err := r.store.Get(ctx, memoKey); err == nil {
			item.Memo = string(obj.Data)
		}
	}
	return item, nil
}

func (r *Repo) FindAll(ctx context.Context, userID string) ([]Item, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+itemColumns+`
		FROM daily_schedule_items
		WHERE user_id = $1
		ORDER BY start_time ASC, created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Item, 0)
	for rows.Next() {
		item, err := r.scanItem(ctx, rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repo) storeMemo(ctx context.Context, userID, itemID, memo string) (string, string, int, error) {
	objectKey := fmt.Sprintf("schedule-payloads/%s/%s/memo.txt", userID, itemID)
	publicURL, err := r.store.Put(ctx, objectKey, "text/plain; charset=utf-8", []byte(memo))
	if err != nil {
		return "", "", 0, err
	}
	return objectKey, publicURL, len(memo), nil
}

func (r *Repo) Create(ctx context.Context, userID string, req itemRequest) (Item, error) {
	itemID := newUUID()
	memo := ""
	if req.Memo != nil {
		memo = strings.TrimSpace(*req.Memo)
	}
	objectKey, publicURL, byteSize, err := r.storeMemo(ctx, userID, itemID, memo)
	if err != nil {
		return Item{}, err
	}
	category := ""
	if req.Category != nil {
		category = strings.TrimSpace(*req.Category)
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "#0f766e"
	}
	isActive := req.active() == nil || *req.active()

	return r.scanItem(ctx, r.pool.QueryRow(ctx, `
		INSERT INTO daily_schedule_items (
			id, user_id, title, days_of_week, start_time, end_time,
			category, color, memo, memo_object_key, memo_byte_size, memo_public_url, is_active
		)
		VALUES ($1::uuid, $2, $3, $4, $5::time, $6::time, $7, $8, '', $9, $10, $11, $12)
		RETURNING `+itemColumns+`
	`, itemID, userID, strings.TrimSpace(req.Title), normalizeDaysOrPanic(req.days()),
		req.start(), req.end(), category, color, objectKey, byteSize, publicURL, isActive))
}

// Update는 Spring과 동일하게 본문에 온 snake_case 필드만 동적으로 갱신한다.
func (r *Repo) Update(ctx context.Context, userID, id string, body map[string]json.RawMessage) (Item, bool, error) {
	assignments := make([]string, 0, 8)
	values := make([]any, 0, 10)
	next := func(v any) string {
		values = append(values, v)
		return fmt.Sprintf("$%d", len(values))
	}

	for _, key := range []string{"title", "days_of_week", "start_time", "end_time", "category", "color", "memo", "is_active"} {
		raw, ok := body[key]
		if !ok {
			continue
		}
		switch key {
		case "memo":
			memo := ""
			_ = json.Unmarshal(raw, &memo)
			objectKey, publicURL, byteSize, err := r.storeMemo(ctx, userID, id, strings.TrimSpace(memo))
			if err != nil {
				return Item{}, false, err
			}
			assignments = append(assignments,
				"memo = ''",
				"memo_object_key = "+next(objectKey),
				"memo_byte_size = "+next(byteSize),
				"memo_public_url = "+next(publicURL))
		case "days_of_week":
			var days []string
			_ = json.Unmarshal(raw, &days)
			normalized, err := normalizeDays(days)
			if err != nil {
				return Item{}, false, err
			}
			assignments = append(assignments, "days_of_week = "+next(normalized))
		case "start_time", "end_time":
			var t *string
			_ = json.Unmarshal(raw, &t)
			assignments = append(assignments, key+" = "+next(t)+"::time")
		case "is_active":
			var b *bool
			_ = json.Unmarshal(raw, &b)
			assignments = append(assignments, "is_active = "+next(b))
		case "color":
			var s string
			_ = json.Unmarshal(raw, &s)
			if strings.TrimSpace(s) == "" {
				s = "#0f766e"
			}
			assignments = append(assignments, "color = "+next(strings.TrimSpace(s)))
		default:
			var s string
			_ = json.Unmarshal(raw, &s)
			assignments = append(assignments, key+" = "+next(strings.TrimSpace(s)))
		}
	}
	if len(assignments) == 0 {
		return Item{}, false, nil
	}

	sql := fmt.Sprintf(`
		UPDATE daily_schedule_items
		SET %s, updated_at = NOW()
		WHERE id = %s AND user_id = %s
		  AND start_time <> end_time
		  AND cardinality(days_of_week) > 0
		RETURNING `+itemColumns, strings.Join(assignments, ", "), next(id), next(userID))

	item, err := r.scanItem(ctx, r.pool.QueryRow(ctx, sql, values...))
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, false, nil
	}
	if err != nil {
		return Item{}, false, err
	}
	return item, true, nil
}

func (r *Repo) Delete(ctx context.Context, userID, id string) (Item, bool, error) {
	item, err := r.scanItem(ctx, r.pool.QueryRow(ctx, `
		DELETE FROM daily_schedule_items
		WHERE id = $1 AND user_id = $2
		RETURNING `+itemColumns, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, false, nil
	}
	if err != nil {
		return Item{}, false, err
	}
	return item, true, nil
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
	mux.Handle("GET /api/schedule-items", p(h.list))
	mux.Handle("POST /api/schedule-items", p(h.create))
	mux.Handle("PATCH /api/schedule-items/{id}", p(h.update))
	mux.Handle("DELETE /api/schedule-items/{id}", p(h.delete))
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.FindAll(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, items)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req itemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "시간표 데이터가 필요합니다."))
		return
	}
	if err := validate(req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	item, err := h.repo.Create(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/schedule-items/"+item.ID)
	httpjson.Write(w, http.StatusCreated, item)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	item, found, err := h.repo.Update(r.Context(), auth.UserID(r.Context()), r.PathValue("id"), body)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":             "시간표가 수정되었습니다.",
		"updatedScheduleItem": item,
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	item, found, err := h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("id"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":             "시간표가 삭제되었습니다.",
		"deletedScheduleItem": item,
	})
}

func validate(req itemRequest) error {
	if strings.TrimSpace(req.Title) == "" {
		return httpjson.Errorf(http.StatusBadRequest, "시간표 제목은 필수입니다.")
	}
	days, err := normalizeDays(req.days())
	if err != nil {
		return err
	}
	if len(days) == 0 {
		return httpjson.Errorf(http.StatusBadRequest, "반복 요일을 하나 이상 선택해야 합니다.")
	}
	start, end := normalizeTime(req.start()), normalizeTime(req.end())
	if start == "" || end == "" || start == end {
		// 종료 < 시작은 자정을 넘겨 다음 날로 이어지는 일정으로 허용한다(Spring과 동일).
		return httpjson.Errorf(http.StatusBadRequest, "시작 시간과 종료 시간은 같을 수 없습니다.")
	}
	return nil
}

func normalizeTime(v string) string {
	v = strings.TrimSpace(v)
	if len(v) == 5 {
		return v + ":00"
	}
	return v
}

func normalizeDays(days []string) ([]string, error) {
	normalized := make([]string, 0, len(days))
	seen := map[string]bool{}
	for _, day := range days {
		value := strings.ToUpper(strings.TrimSpace(day))
		if value == "" {
			continue
		}
		if !validDays[value] {
			return nil, httpjson.Errorf(http.StatusBadRequest, "지원하지 않는 요일입니다: "+day)
		}
		if !seen[value] {
			seen[value] = true
			normalized = append(normalized, value)
		}
	}
	return normalized, nil
}

func normalizeDaysOrPanic(days []string) []string {
	normalized, _ := normalizeDays(days)
	return normalized
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func newUUID() string {
	return storage.NewUUID()
}
