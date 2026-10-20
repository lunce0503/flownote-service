package notes

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"strings"
	"testing"
	"time"
)

func TestExplicitFormatValidation(t *testing.T) {
	for _, raw := range []string{`null`, `{}`, `"text"`, `{"format":"markdown","version":2,"markdown":""}`, `{"format":"markdown","version":1}`, `{"format":"markdown","version":1,"markdown":null}`} {
		if _, err := contentFormat(json.RawMessage(raw)); err == nil {
			t.Fatalf("accepted invalid format: %s", raw)
		}
	}
	for _, raw := range []string{`[]`, `[{"type":"drawing"}]`, `{"format":"markdown","version":1,"markdown":""}`} {
		if _, err := contentFormat(json.RawMessage(raw)); err != nil {
			t.Fatalf("rejected content %s: %v", raw, err)
		}
	}
}
func TestOldClientCannotOverwriteMarkdownBeforeUpload(t *testing.T) {
	now := time.Now()
	store := &countingStore{}
	repo := &Repo{store: store, queryRow: func(_ context.Context, _ string, _ ...any) pgx.Row {
		return testRow{values: []any{"note", "title", `{"format":"markdown","version":1}`, "key", now, now, int64(3), "new"}}
	}}
	_, err := repo.Upsert(context.Background(), "owner", NoteRequest{ID: "note", Title: "old", Content: json.RawMessage(`[]`), Revision: 4, ClientID: "old"})
	if err != errNoteFormat || store.gets != 0 || store.puts != 0 {
		t.Fatalf("old client not fenced: %v reads=%d puts=%d", err, store.gets, store.puts)
	}
}
func TestConversionPreservesServerOriginalAndAtomicSQLGuard(t *testing.T) {
	now := time.Now()
	store := &countingStore{}
	original := `[{"type":"drawing","props":{"strokes":[1,2]}}]`
	store.data = []byte(original)
	calls := 0
	repo := &Repo{store: store, queryRow: func(_ context.Context, sql string, args ...any) pgx.Row {
		calls++
		if calls == 1 {
			return testRow{values: []any{"note", "old", "[]", "original", now, now, int64(1), "old"}}
		}
		if !strings.Contains(sql, "notes.content->>'format'") || !strings.Contains(sql, "notes.revision + 1") {
			t.Fatal("missing atomic format/revision predicate")
		}
		if args[9] != `{"format":"markdown","version":1}` {
			t.Fatal("missing database format marker")
		}
		return testRow{values: []any{"note", "new", args[9], args[3], now, now, int64(2), "client"}}
	}}
	result, err := repo.Upsert(context.Background(), "owner", NoteRequest{ID: "note", Title: "new", Content: json.RawMessage(`{"format":"markdown","version":1,"markdown":"text","legacy_original":[]}`), Revision: 2, ClientID: "client"})
	if err != nil {
		t.Fatal(err)
	}
	var doc MarkdownContent
	if err := json.Unmarshal(result.Content, &doc); err != nil {
		t.Fatal(err)
	}
	if string(doc.LegacyOriginal) != original {
		t.Fatalf("server original not preserved: %s", doc.LegacyOriginal)
	}
	if store.gets != 1 || store.puts != 1 {
		t.Fatalf("conversion IO: %d/%d", store.gets, store.puts)
	}
}
func TestReusedRevisionWithDifferentInputIsNotAcknowledged(t *testing.T) {
	original := json.RawMessage(`{"format":"markdown","version":1,"markdown":"A","legacy_original":[]}`)
	if !sameRequestedContent(original, json.RawMessage(`{"format":"markdown","version":1,"markdown":"A"}`)) {
		t.Fatal("server backup must not break idempotence")
	}
	if sameRequestedContent(original, json.RawMessage(`{"format":"markdown","version":1,"markdown":"B"}`)) {
		t.Fatal("new input must not be acknowledged as an older save")
	}
}
func TestDifferentTitleCannotReuseAnAcknowledgedRevision(t *testing.T) {
	now := time.Now()
	calls := 0
	store := &countingStore{}
	repo := &Repo{store: store, queryRow: func(_ context.Context, _ string, _ ...any) pgx.Row {
		calls++
		if calls == 1 {
			return testRow{err: pgx.ErrNoRows}
		}
		return testRow{values: []any{"note", "winning title", "[]", "body", now, now, int64(2), "client"}}
	}}
	_, err := repo.UpdateTitle(context.Background(), "owner", "note", NoteTitleUpdateRequest{Title: "different title", Revision: 2, ClientID: "client"})
	if err != errNoteConflict || store.gets != 0 {
		t.Fatal("different title was silently acknowledged")
	}
}
