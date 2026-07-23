package diary

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/httpjson"
	"github.com/flownote/flownote-serve/internal/storage"
)

// diary: 하루 단위 "일기장" 도메인.
// - todos:  [{id,label,color,done}] — 사용자가 색을 지정하는 오늘의 할일/완료한 일
// - grid:   시간표 칸 채우기 상태(프론트가 정의하는 불투명 jsonb: {start_hour,end_hour,cols,cells})
// - journal:BlockNote 문서(블록 배열)
// 계약: 응답 snake_case, 날짜는 "YYYY-MM-DD". 저장은 (user_id, entry_date) upsert.
// flownote-serve에는 마이그레이션 러너가 없으므로 시작 시 CREATE TABLE IF NOT EXISTS로 스키마를 보장한다.

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type Entry struct {
	ID        string          `json:"id"`
	EntryDate string          `json:"entry_date"`
	Todos     json.RawMessage `json:"todos"`
	Grid      json.RawMessage `json:"grid"`
	Journal   json.RawMessage `json:"journal"`
	CreatedAt *time.Time      `json:"created_at,omitempty"`
	UpdatedAt *time.Time      `json:"updated_at,omitempty"`
}

type saveRequest struct {
	Todos   json.RawMessage `json:"todos"`
	Grid    json.RawMessage `json:"grid"`
	Journal json.RawMessage `json:"journal"`
}

// EnsureSchema는 diary_entries 테이블을 없으면 생성한다(idempotent).
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS diary_entries (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL,
			entry_date DATE NOT NULL,
			todos JSONB NOT NULL DEFAULT '[]'::jsonb,
			grid JSONB NOT NULL DEFAULT '{}'::jsonb,
			journal JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (user_id, entry_date)
		);
	`)
	return err
}

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

// validDate는 "YYYY-MM-DD" 형식과 실제 달력 유효성을 검사한다.
func validDate(date string) bool {
	if !datePattern.MatchString(date) {
		return false
	}
	_, err := time.Parse("2006-01-02", date)
	return err == nil
}

// jsonbOrDefault는 nil/빈 RawMessage를 기본값으로 대체하고, JSON 유효성을 검증한다.
func jsonbOrDefault(raw json.RawMessage, fallback string) (string, error) {
	if len(raw) == 0 {
		return fallback, nil
	}
	if !json.Valid(raw) {
		return "", httpjson.Errorf(http.StatusBadRequest, "잘못된 JSON 형식입니다.")
	}
	return string(raw), nil
}

func scanEntry(row pgx.Row) (Entry, error) {
	var e Entry
	var todos, grid, journal string
	var createdAt, updatedAt time.Time
	if err := row.Scan(&e.ID, &e.EntryDate, &todos, &grid, &journal, &createdAt, &updatedAt); err != nil {
		return Entry{}, err
	}
	e.Todos = json.RawMessage(todos)
	e.Grid = json.RawMessage(grid)
	e.Journal = json.RawMessage(journal)
	e.CreatedAt = &createdAt
	e.UpdatedAt = &updatedAt
	return e, nil
}

const entryColumns = `id, to_char(entry_date,'YYYY-MM-DD'), todos::text, grid::text, journal::text, created_at, updated_at`

// Get은 해당 날짜의 일기를 반환한다. 없으면 (Entry{}, false, nil).
func (r *Repo) Get(ctx context.Context, userID, date string) (Entry, bool, error) {
	e, err := scanEntry(r.pool.QueryRow(ctx, `
		SELECT `+entryColumns+`
		FROM diary_entries
		WHERE user_id = $1 AND entry_date = $2::date
	`, userID, date))
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, false, nil
	}
	if err != nil {
		return Entry{}, false, err
	}
	return e, true, nil
}

// Save는 (user_id, entry_date) 기준으로 upsert 한다.
func (r *Repo) Save(ctx context.Context, userID, date string, req saveRequest) (Entry, error) {
	todos, err := jsonbOrDefault(req.Todos, "[]")
	if err != nil {
		return Entry{}, err
	}
	grid, err := jsonbOrDefault(req.Grid, "{}")
	if err != nil {
		return Entry{}, err
	}
	journal, err := jsonbOrDefault(req.Journal, "[]")
	if err != nil {
		return Entry{}, err
	}

	return scanEntry(r.pool.QueryRow(ctx, `
		INSERT INTO diary_entries (id, user_id, entry_date, todos, grid, journal)
		VALUES ($1, $2, $3::date, $4::jsonb, $5::jsonb, $6::jsonb)
		ON CONFLICT (user_id, entry_date) DO UPDATE
		SET todos = EXCLUDED.todos, grid = EXCLUDED.grid, journal = EXCLUDED.journal, updated_at = NOW()
		RETURNING `+entryColumns,
		storage.NewUUID(), userID, date, todos, grid, journal))
}

// Dates는 일기가 존재하는 날짜 목록을 최신순으로 반환한다.
func (r *Repo) Dates(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT to_char(entry_date,'YYYY-MM-DD')
		FROM diary_entries
		WHERE user_id = $1
		ORDER BY entry_date DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	dates := make([]string, 0)
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		dates = append(dates, d)
	}
	return dates, rows.Err()
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
	mux.Handle("GET /api/diary", p(h.get))
	mux.Handle("GET /api/diary/dates", p(h.dates))
	mux.Handle("PUT /api/diary/{date}", p(h.save))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if !validDate(date) {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "날짜 형식은 YYYY-MM-DD 이어야 합니다."))
		return
	}
	entry, found, err := h.repo.Get(r.Context(), auth.UserID(r.Context()), date)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		// 없으면 빈 일기를 200으로 반환해 프론트가 바로 편집을 시작할 수 있게 한다.
		httpjson.Write(w, http.StatusOK, Entry{
			EntryDate: date,
			Todos:     json.RawMessage("[]"),
			Grid:      json.RawMessage("{}"),
			Journal:   json.RawMessage("[]"),
		})
		return
	}
	httpjson.Write(w, http.StatusOK, entry)
}

func (h *Handler) save(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if !validDate(date) {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "날짜 형식은 YYYY-MM-DD 이어야 합니다."))
		return
	}
	var req saveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "일기 데이터가 필요합니다."))
		return
	}
	entry, err := h.repo.Save(r.Context(), auth.UserID(r.Context()), date, req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, entry)
}

func (h *Handler) dates(w http.ResponseWriter, r *http.Request) {
	dates, err := h.repo.Dates(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, dates)
}
