package notes

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/flownote/flownote-canvas/internal/httpjson"
)

var errNoteFormat = httpjson.Errorf(409, "Markdown 노트는 구형 블록 요청으로 덮어쓸 수 없습니다. 최신 클라이언트를 사용하세요.")

// Legacy arrays stay byte-compatible. Markdown is explicitly versioned, including empty text.
func contentFormat(raw json.RawMessage) (string, error) {
	raw = bytes.TrimSpace(raw)
	if !json.Valid(raw) || len(raw) == 0 {
		return "", httpjson.Errorf(400, "올바른 노트 본문이 필요합니다.")
	}
	if raw[0] == '[' {
		return "blocknote", nil
	}
	var doc struct {
		Format   string  `json:"format"`
		Version  int     `json:"version"`
		Markdown *string `json:"markdown"`
	}
	if json.Unmarshal(raw, &doc) != nil || doc.Format != "markdown" || doc.Version != 1 || doc.Markdown == nil {
		return "", httpjson.Errorf(400, "지원하지 않는 노트 format/version입니다.")
	}
	return "markdown", nil
}

func (r *Repo) idempotentContent(ctx context.Context, current noteRow, req NoteRequest) (NoteResponse, error) {
	response, err := r.resolveContent(ctx, current)
	if err != nil {
		return NoteResponse{}, err
	}
	if response.Title != req.Title || !sameRequestedContent(response.Content, req.Content) {
		return NoteResponse{}, errNoteConflict
	}
	return response, nil
}
func sameRequestedContent(a, b json.RawMessage) bool {
	var left, right MarkdownContent
	if json.Unmarshal(a, &left) == nil && left.Format == "markdown" {
		return json.Unmarshal(b, &right) == nil && left.Format == right.Format && left.Version == right.Version && left.Markdown == right.Markdown
	}
	return bytes.Equal(compactJSON(a), compactJSON(b))
}
