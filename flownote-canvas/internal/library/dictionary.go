package library

import (
	"context"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/flownote/flownote-canvas/internal/httpjson"
)

var dictionaryClient = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
var tags = regexp.MustCompile(`<[^>]*>`)

func plainDefinition(value string) string {
	return strings.Join(strings.Fields(html.UnescapeString(tags.ReplaceAllString(value, " "))), " ")
}
func sourceURL(term string) string { return "https://en.wiktionary.org/wiki/" + url.PathEscape(term) }
func validTerm(term string) bool {
	if strings.TrimSpace(term) == "" || utf8.RuneCountInString(term) > 120 {
		return false
	}
	for _, r := range term {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

type DictionarySense struct {
	PartOfSpeech string `json:"partOfSpeech"`
	Definition   string `json:"definition"`
	Translation  string `json:"translation"`
}
type DictionaryResult struct {
	Term       string            `json:"term"`
	Definition string            `json:"definition"`
	SourceURL  string            `json:"sourceUrl"`
	License    string            `json:"license"`
	Found      bool              `json:"found"`
	Language   string            `json:"language"`
	Senses     []DictionarySense `json:"senses"`
}
type dictionaryEntry struct {
	PartOfSpeech string `json:"partOfSpeech"`
	Definitions  []struct {
		Definition string `json:"definition"`
	} `json:"definitions"`
}

func parseDefinitions(data []byte, term string) (DictionaryResult, error) {
	result := DictionaryResult{Term: term, SourceURL: sourceURL(term), License: "Wiktionary · CC BY-SA", Senses: []DictionarySense{}}
	var entries map[string][]dictionaryEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return result, httpjson.Errorf(502, "사전 응답을 해석하지 못했습니다.")
	}
	keys := []string{"en", "ko"}
	for _, r := range term {
		if r >= 0xAC00 && r <= 0xD7A3 {
			keys = []string{"ko", "en"}
			break
		}
	}
	other := []string{}
	for key := range entries {
		if key != "en" && key != "ko" {
			other = append(other, key)
		}
	}
	sort.Strings(other)
	keys = append(keys, other...)
	for _, key := range keys {
		groups := [][]DictionarySense{}
		seen := map[string]bool{}
		for _, entry := range entries[key] {
			group := []DictionarySense{}
			for _, d := range entry.Definitions {
				value := plainDefinition(d.Definition)
				if value == "" || seen[value] {
					continue
				}
				seen[value] = true
				runes := []rune(value)
				if len(runes) > 700 {
					value = string(runes[:700]) + "…"
				}
				part := []rune(strings.ToLower(strings.TrimSpace(entry.PartOfSpeech)))
				if len(part) > 80 {
					part = part[:80]
				}
				group = append(group, DictionarySense{PartOfSpeech: string(part), Definition: value})
			}
			if len(group) > 0 {
				groups = append(groups, group)
			}
		}
		// Include different parts of speech before filling the remaining senses.
		for index := 0; len(result.Senses) < 8; index++ {
			added := false
			for _, group := range groups {
				if index < len(group) {
					result.Senses = append(result.Senses, group[index])
					added = true
					if len(result.Senses) == 8 {
						break
					}
				}
			}
			if !added {
				break
			}
		}
		if len(result.Senses) > 0 {
			break
		}
	}
	definitions := []string{}
	for _, sense := range result.Senses {
		definitions = append(definitions, sense.Definition)
	}
	result.Found = len(result.Senses) > 0
	result.Definition = strings.Join(definitions, "\n\n")
	return result, nil
}
func lookupDictionary(ctx context.Context, term string) (DictionaryResult, error) {
	result := DictionaryResult{Term: term, SourceURL: sourceURL(term), License: "Wiktionary · CC BY-SA"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://en.wiktionary.org/api/rest_v1/page/definition/"+url.PathEscape(term), nil)
	if err != nil {
		return result, err
	}
	req.Header.Set("User-Agent", "Flownote/1.3 (private textbook dictionary; https://github.com/lunce0503/flownote-service)")
	response, err := dictionaryClient.Do(req)
	if err != nil {
		return result, httpjson.Errorf(503, "사전에 연결하지 못했습니다. 단어는 직접 저장하거나 다시 검색할 수 있습니다.")
	}
	defer response.Body.Close()
	if response.StatusCode == 404 {
		return result, nil
	}
	if response.StatusCode != 200 {
		return result, httpjson.Errorf(503, "사전이 응답하지 않습니다. 잠시 뒤 다시 검색해 주세요.")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil || len(data) > 2*1024*1024 {
		return result, httpjson.Errorf(502, "사전 응답이 너무 크거나 완전하지 않습니다.")
	}
	return parseDefinitions(data, term)
}

type Term struct {
	ID         string    `json:"id"`
	BookID     string    `json:"bookId"`
	Page       int       `json:"page"`
	Term       string    `json:"term"`
	Definition string    `json:"definition"`
	SourceURL  string    `json:"sourceUrl"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (r *Repo) saveTerm(ctx context.Context, user string, t Term, overwrite bool) (Term, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return t, err
	}
	defer tx.Rollback(ctx)
	b, err := readBook(tx.QueryRow(ctx, `SELECT `+bookColumns+` FROM library_books WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR SHARE`, t.BookID, user))
	if err != nil {
		return t, err
	}
	if b.Deleted {
		return t, notFound
	}
	t.Term = strings.TrimSpace(t.Term)
	if !validTerm(t.Term) || t.Page < 1 || t.Page > b.Pages || utf8.RuneCountInString(t.Definition) > 8000 {
		return t, httpjson.Errorf(400, "저장할 단어와 페이지를 확인해 주세요.")
	}
	if t.ID == "" {
		t.ID = newID()
	}
	if !validID(t.ID) {
		return t, httpjson.Errorf(400, "단어 식별자가 올바르지 않습니다.")
	}
	t.SourceURL = sourceURL(t.Term)
	err = tx.QueryRow(ctx, `INSERT INTO library_terms(id,user_id,book_id,page,term,definition,source_url)
      SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(SELECT 1 FROM library_books WHERE id=$3 AND user_id=$2 AND deleted_at IS NULL)
      ON CONFLICT(user_id,book_id,page,term) DO UPDATE SET definition=CASE WHEN $8 OR library_terms.definition='' THEN EXCLUDED.definition ELSE library_terms.definition END,source_url=EXCLUDED.source_url
      RETURNING id::text,definition,created_at`, t.ID, user, t.BookID, t.Page, t.Term, t.Definition, t.SourceURL, overwrite).Scan(&t.ID, &t.Definition, &t.CreatedAt)
	if err != nil {
		return t, rowError(err)
	}
	return t, tx.Commit(ctx)
}
func (h *Handler) lookup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID   string `json:"id"`
		Term string `json:"term"`
		Page int    `json:"page"`
	}
	if err := decode(w, r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	req.Term = strings.TrimSpace(req.Term)
	if !validTerm(req.Term) {
		respond(w, nil, httpjson.Errorf(400, "120자 이내의 단어나 짧은 구절을 선택해 주세요."))
		return
	}
	b, err := h.repo.Get(r.Context(), auth.UserID(r.Context()), r.PathValue("bookID"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	if b.Deleted {
		respond(w, nil, notFound)
		return
	}
	if req.Page < 1 || req.Page > b.Pages {
		respond(w, nil, httpjson.Errorf(400, "페이지가 올바르지 않습니다."))
		return
	}
	if !h.translator.Allow(auth.UserID(r.Context())) {
		w.Header().Set("Retry-After", "60")
		respond(w, nil, httpjson.Errorf(429, "사전 검색이 잠시 많습니다. 1분 뒤 다시 검색해 주세요."))
		return
	}
	definition, err := lookupDictionary(r.Context(), req.Term)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if definition.Found {
		translated, translationErr := h.translator.Translate(r.Context(), req.Term, definition.Senses)
		if translationErr != nil {
			respond(w, nil, translationErr)
			return
		}
		definitions := []string{}
		for index := range definition.Senses {
			definition.Senses[index].Translation = translated[index]
			definitions = append(definitions, strconv.Itoa(index+1)+". "+translated[index])
		}
		definition.Language = "ko"
		definition.Definition = strings.Join(definitions, "\n\n")
	}
	term, err := h.repo.saveTerm(r.Context(), auth.UserID(r.Context()), Term{ID: req.ID, BookID: b.ID, Page: req.Page, Term: req.Term, Definition: definition.Definition}, false)
	respond(w, map[string]any{"result": definition, "saved": term}, err)
}
func (h *Handler) saveTerm(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID         string `json:"id"`
		Page       int    `json:"page"`
		Term       string `json:"term"`
		Definition string `json:"definition"`
	}
	if err := decode(w, r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	t, err := h.repo.saveTerm(r.Context(), auth.UserID(r.Context()), Term{ID: req.ID, BookID: r.PathValue("bookID"), Page: req.Page, Term: req.Term, Definition: req.Definition}, true)
	respond(w, t, err)
}
func (h *Handler) terms(w http.ResponseWriter, r *http.Request) {
	user, bookID := auth.UserID(r.Context()), r.PathValue("bookID")
	b, err := h.repo.Get(r.Context(), user, bookID)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if b.Deleted {
		respond(w, nil, notFound)
		return
	}
	// A stable, paged history, including old entries after the first page.
	offset, err := parseOffset(r.URL.Query().Get("offset"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	rows, err := h.repo.pool.Query(r.Context(), `SELECT id::text,page,term,definition,source_url,created_at FROM library_terms WHERE user_id=$1 AND book_id=$2 ORDER BY created_at DESC,id LIMIT 101 OFFSET $3`, user, bookID, offset)
	if err != nil {
		respond(w, nil, err)
		return
	}
	defer rows.Close()
	terms := []Term{}
	for rows.Next() {
		t := Term{BookID: bookID}
		if err = rows.Scan(&t.ID, &t.Page, &t.Term, &t.Definition, &t.SourceURL, &t.CreatedAt); err != nil {
			respond(w, nil, err)
			return
		}
		terms = append(terms, t)
	}
	more := len(terms) > 100
	if more {
		terms = terms[:100]
	}
	respond(w, map[string]any{"terms": terms, "more": more}, rows.Err())
}
func (h *Handler) deleteTerm(w http.ResponseWriter, r *http.Request) {
	// Ownership and parent book are included in the mutation predicate.
	result, err := h.repo.pool.Exec(r.Context(), `DELETE FROM library_terms WHERE id=$1 AND book_id=$2 AND user_id=$3`, r.PathValue("termID"), r.PathValue("bookID"), auth.UserID(r.Context()))
	if err == nil && result.RowsAffected() == 0 {
		err = notFound
	}
	respond(w, map[string]bool{"ok": true}, err)
}

func parseOffset(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(raw)
	if err != nil || offset < 0 || offset > 100000 {
		return 0, httpjson.Errorf(400, "검색 기록 위치가 올바르지 않습니다.")
	}
	return offset, nil
}
