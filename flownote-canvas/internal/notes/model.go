package notes

import (
	"encoding/json"
	"time"
)

// Spring NoteDtos/NoteFolderDtos와 동일한 JSON 계약(jackson SNAKE_CASE)을 유지한다.

type NoteRequest struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Content   json.RawMessage `json:"content"`
	CreatedAt *time.Time      `json:"created_at"`
	Revision  int64           `json:"revision"`
	ClientID  string          `json:"client_id"`
}

type NoteTitleUpdateRequest struct {
	Title    string `json:"title"`
	Revision int64  `json:"revision"`
	ClientID string `json:"client_id"`
}

type NoteResponse struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Content   json.RawMessage `json:"content"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	Revision  int64           `json:"revision"`
	ClientID  string          `json:"client_id"`
}

type FolderCreateRequest struct {
	Category *string  `json:"category"`
	Name     string   `json:"name"`
	NoteIDs  []string `json:"note_ids"`
}

// 수정 요청은 null(미지정)과 빈 값을 구분해야 한다(Spring: null이면 기존 값 유지).
type FolderUpdateRequest struct {
	Category *string   `json:"category"`
	Name     *string   `json:"name"`
	NoteIDs  *[]string `json:"note_ids"`
}

type FolderResponse struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Name      string    `json:"name"`
	NoteIDs   []string  `json:"note_ids"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
