package library

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"image"
	"image/jpeg"
	"strings"
	"testing"
	"time"
)

func validBook(t *testing.T) Book {
	t.Helper()
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 1, 1)), nil); err != nil {
		t.Fatal(err)
	}
	return Book{ID: newID(), Title: "Synthetic textbook", Subject: "수학", Pages: 3, Page: 1, Bookmarks: []int{}, Filename: "example.pdf", Bytes: MaxBookBytes, Cover: "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(data.Bytes()), CreatedAt: time.Now().UTC().Format(time.RFC3339)}
}
func TestBookValidationAndMetadataChanges(t *testing.T) {
	b := validBook(t)
	if err := b.Validate(); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		change func(*Book)
	}{
		{"foreign path id", func(b *Book) { b.ID = "../private" }},
		{"oversize file", func(b *Book) { b.Bytes = MaxBookBytes + 1 }},
		{"invalid progress", func(b *Book) { b.Page = 4 }},
		{"invalid bookmark", func(b *Book) { b.Bookmarks = []int{4} }},
		{"duplicate bookmark", func(b *Book) { b.Bookmarks = []int{2, 2} }},
		{"svg cover", func(b *Book) {
			b.Cover = "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte("<svg/>"))
		}},
		{"header injection", func(b *Book) { b.Filename = "book.pdf\r\nX: header" }},
		{"empty title", func(b *Book) { b.Title = " " }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			copy := b
			tc.change(&copy)
			if copy.Validate() == nil {
				t.Fatal("accepted invalid book")
			}
		})
	}
	title := "Updated title"
	page := 3
	updated, err := (Changes{Title: &title, Page: &page}).Apply(b)
	if err != nil || updated.Title != title || updated.Page != page || updated.Cover != b.Cover || updated.Bytes != b.Bytes {
		t.Fatal("metadata mutation damaged original", err)
	}
}
func TestChunkBoundsAndIntegrity(t *testing.T) {
	for _, size := range []int64{1, ChunkBytes, ChunkBytes + 1, MaxBookBytes} {
		count := chunkCount(size)
		var total int64
		for part := 0; part < count; part++ {
			n := chunkSize(size, part)
			if n < 1 || n > ChunkBytes {
				t.Fatal("unbounded chunk")
			}
			total += n
		}
		if total != size || chunkSize(size, -1) != 0 || chunkSize(size, count) != 0 {
			t.Fatal("chunk bounds lost bytes")
		}
	}
	data := []byte("%PDF-1.7 synthetic")
	sum := sha256.Sum256(data)
	p := Part{Bytes: int64(len(data)), SHA256: hex.EncodeToString(sum[:])}
	if err := validatePart(data, p); err != nil {
		t.Fatal(err)
	}
	if validatePart(append(data, 0), p) == nil {
		t.Fatal("accepted corrupt bytes")
	}
	if validatePart([]byte("%PDF-1.7 tampered!"), p) == nil {
		t.Fatal("accepted mismatching hash")
	}
}
func TestDictionaryParsingAndLimits(t *testing.T) {
	result, err := parseDefinitions([]byte(`{"en":[{"partOfSpeech":"noun","definitions":[{"definition":"A <b>synthetic</b> &amp; bounded definition."}]}]}`), "derivative")
	if err != nil || !result.Found || result.Definition != "A synthetic & bounded definition." || !strings.HasPrefix(result.SourceURL, "https://en.wiktionary.org/wiki/") {
		t.Fatal("invalid dictionary result", result, err)
	}
	result, err = parseDefinitions([]byte(`{"ko":[{"definitions":[{"definition":"Synthetic Korean entry."}]}]}`), "미분")
	if err != nil || !result.Found || strings.Contains(result.Definition, "<") {
		t.Fatal("Korean entry failed")
	}
	for _, term := range []string{"", strings.Repeat("x", 121), "word\nheader", "word\x00"} {
		if validTerm(term) {
			t.Fatal("accepted unsafe or oversized term")
		}
	}
	if !validTerm("미분") || !validTerm("partial derivative") {
		t.Fatal("rejected normal dictionary text")
	}
	if _, err = parseDefinitions([]byte("not json"), "word"); err == nil {
		t.Fatal("accepted invalid provider data")
	}
}
