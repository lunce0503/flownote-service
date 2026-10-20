package notes

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/flownote/flownote-canvas/internal/storage"
	"github.com/jackc/pgx/v5"
)

type testRow struct {
	values []any
	err    error
}

func (r testRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for i := range dest {
		reflect.ValueOf(dest[i]).Elem().Set(reflect.ValueOf(r.values[i]))
	}
	return nil
}

type testRows struct {
	pgx.Rows
	rows  []testRow
	index int
}

func (r *testRows) Next() bool             { r.index++; return r.index <= len(r.rows) }
func (r *testRows) Scan(dest ...any) error { return r.rows[r.index-1].Scan(dest...) }
func (r *testRows) Close()                 {}
func (r *testRows) Err() error             { return nil }

type countingStore struct {
	gets int
	puts int
	fail bool
	keys []string
	data []byte
}

func (s *countingStore) Get(_ context.Context, key string) (*storage.Object, error) {
	s.gets++
	s.keys = append(s.keys, key)
	if s.data != nil {
		return &storage.Object{Data: s.data}, nil
	}
	if s.fail {
		return nil, errors.New("synthetic failure")
	}
	return &storage.Object{Data: []byte(`[{"text":"synthetic"}]`)}, nil
}
func (s *countingStore) Put(context.Context, string, string, []byte) (string, error) {
	s.puts++
	return "", nil
}
func (*countingStore) Delete(context.Context, string) error { return nil }

func TestSummaryDoesNotReadContentAndHasStableCursor(t *testing.T) {
	now := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	ids := []string{"00000000-0000-0000-0000-000000000003", "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000001"}
	store := &countingStore{fail: true}
	calls := 0
	repo := &Repo{store: store, query: func(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
		if strings.Contains(sql, "content") || !strings.Contains(sql, "created_at DESC, id DESC") {
			t.Fatal("metadata query must not select body and must use total ordering")
		}
		if args[0] != "owner" {
			t.Fatal("missing owner scope")
		}
		start := 0
		if calls > 0 {
			if args[2] != ids[1] {
				t.Fatalf("wrong tie-break cursor: %v", args)
			}
			start = 2
		}
		calls++
		rows := &testRows{}
		for _, id := range ids[start:] {
			rows.rows = append(rows.rows, testRow{values: []any{id, "title", now, now, int64(2)}})
		}
		return rows, nil
	}}
	first, err := repo.ListSummary(context.Background(), "owner", 2, "")
	if err != nil || len(first.Notes) != 2 || first.NextCursor == "" {
		t.Fatalf("first page: %v %v", first, err)
	}
	second, err := repo.ListSummary(context.Background(), "owner", 2, first.NextCursor)
	if err != nil || len(second.Notes) != 1 || second.Notes[0].ID != ids[2] {
		t.Fatalf("second page: %v %v", second, err)
	}
	if store.gets != 0 {
		t.Fatal("summary read object storage")
	}
	raw, _ := json.Marshal(first)
	if strings.Contains(string(raw), "content") {
		t.Fatal("summary must omit content")
	}
	if _, err := decodeNoteCursor("not a cursor"); err == nil {
		t.Fatal("invalid cursor accepted")
	}
}

func TestDetailReadsOnlyOwnedBody(t *testing.T) {
	now := time.Now()
	store := &countingStore{}
	repo := &Repo{store: store, queryRow: func(_ context.Context, sql string, args ...any) pgx.Row {
		if !strings.Contains(sql, "id = $1 AND user_id = $2") || args[0] != "note" {
			t.Fatal("missing detail scope")
		}
		if args[1] != "owner" {
			return testRow{err: pgx.ErrNoRows}
		}
		return testRow{values: []any{"note", "title", "[]", "object", now, now, int64(1), "client"}}
	}}
	if _, err := repo.Get(context.Background(), "owner", "note"); err != nil {
		t.Fatal(err)
	}
	if store.gets != 1 || store.keys[0] != "object" {
		t.Fatal("detail should read exactly the target body")
	}
	if _, err := repo.Get(context.Background(), "other", "note"); err != errNoteNotFound {
		t.Fatalf("cross-owner: %v", err)
	}
	if store.gets != 1 {
		t.Fatal("cross-owner storage read")
	}
	store.fail = true
	if _, err := repo.Get(context.Background(), "owner", "note"); err == nil {
		t.Fatal("storage failure must not look like empty content")
	}
}

func TestLegacyListStillReturnsBodies(t *testing.T) {
	now := time.Now()
	store := &countingStore{}
	repo := &Repo{store: store, query: func(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
		if args[0] != "owner" {
			t.Fatal("missing legacy owner filter")
		}
		rows := &testRows{}
		for _, id := range []string{"a", "b", "c"} {
			rows.rows = append(rows.rows, testRow{values: []any{id, "title", "[]", "object-" + id, now, now, int64(1), "client"}})
		}
		return rows, nil
	}}
	notes, err := repo.List(context.Background(), "owner")
	if err != nil || len(notes) != 3 || store.gets != 3 {
		t.Fatalf("legacy compatibility: %v, reads=%d", err, store.gets)
	}
	for _, note := range notes {
		if !strings.Contains(string(note.Content), "synthetic") {
			t.Fatal("legacy body removed")
		}
	}
}

func TestCorruptTargetBodyFailsWithoutHidingMetadata(t *testing.T) {
	store := &countingStore{data: []byte(`broken`)}
	repo := &Repo{store: store}
	_, err := repo.resolveContent(context.Background(), noteRow{objectKey: "target"})
	if err == nil || store.gets != 1 {
		t.Fatal("corrupt body must fail rather than become an empty note")
	}
}
