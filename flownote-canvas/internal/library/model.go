package library

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"github.com/flownote/flownote-canvas/internal/httpjson"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const ChunkBytes = 1024 * 1024
const MaxBookBytes = 100 * ChunkBytes

type Book struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Subject   string    `json:"subject"`
	Pages     int       `json:"pages"`
	Page      int       `json:"page"`
	Bookmarks []int     `json:"bookmarks"`
	Favorite  bool      `json:"favorite"`
	Cover     string    `json:"cover"`
	Filename  string    `json:"filename"`
	Bytes     int64     `json:"bytes"`
	CreatedAt string    `json:"createdAt"`
	Revision  int64     `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
	Deleted   bool      `json:"deleted"`
}

type Changes struct {
	Title     *string `json:"title,omitempty"`
	Subject   *string `json:"subject,omitempty"`
	Page      *int    `json:"page,omitempty"`
	Bookmarks *[]int  `json:"bookmarks,omitempty"`
	Favorite  *bool   `json:"favorite,omitempty"`
}

func (p Changes) Apply(b Book) (Book, error) {
	if p.Title != nil {
		b.Title = strings.TrimSpace(*p.Title)
	}
	if p.Subject != nil {
		b.Subject = strings.TrimSpace(*p.Subject)
	}
	if p.Page != nil {
		b.Page = *p.Page
	}
	if p.Bookmarks != nil {
		b.Bookmarks = *p.Bookmarks
	}
	if p.Favorite != nil {
		b.Favorite = *p.Favorite
	}
	return b, b.Validate()
}
func (b Book) Validate() error {
	invalid := func() error {
		return httpjson.Errorf(http.StatusBadRequest, "책 정보가 올바르지 않습니다.")
	}
	if !validID(b.ID) || strings.TrimSpace(b.Title) == "" || utf8.RuneCountInString(b.Title) > 160 || strings.TrimSpace(b.Subject) == "" || utf8.RuneCountInString(b.Subject) > 40 {
		return invalid()
	}
	if b.Bytes < 1 || b.Bytes > MaxBookBytes || b.Pages < 1 || b.Pages > 100000 || b.Page < 1 || b.Page > b.Pages || len(b.Bookmarks) > 5000 || len(b.Filename) > 512 || strings.ContainsAny(b.Filename, "\r\n\x00") {
		return invalid()
	}
	seen := map[int]bool{}
	for _, p := range b.Bookmarks {
		if p < 1 || p > b.Pages || seen[p] {
			return invalid()
		}
		seen[p] = true
	}
	if _, err := time.Parse(time.RFC3339, b.CreatedAt); err != nil {
		return invalid()
	}
	if len(b.Cover) > 256*1024 {
		return invalid()
	}
	encoded, ok := strings.CutPrefix(b.Cover, "data:image/jpeg;base64,")
	if !ok {
		encoded, ok = strings.CutPrefix(b.Cover, "data:image/png;base64,")
	}
	if !ok {
		return invalid()
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || !strings.HasPrefix(http.DetectContentType(data), "image/") {
		return invalid()
	}
	return nil
}
func validID(id string) bool {
	if len(id) != 36 || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		return false
	}
	_, err := hex.DecodeString(strings.ReplaceAll(id, "-", ""))
	return err == nil
}
func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
func chunkCount(bytes int64) int { return int((bytes + ChunkBytes - 1) / ChunkBytes) }
func chunkSize(bytes int64, part int) int64 {
	if part < 0 || part >= chunkCount(bytes) {
		return 0
	}
	left := bytes - int64(part)*ChunkBytes
	if left < ChunkBytes {
		return left
	}
	return ChunkBytes
}
func chunkKey(user, book, upload string, part int) string {
	return fmt.Sprintf("library/%s/%s/%s/%03d.pdf-part", user, book, upload, part)
}
