package canvas

import (
	"encoding/json"
	"time"
)

// emptyArray는 JSON 직렬화 시 항상 빈 배열로 나오도록 하는 기본값이다.
var emptyArray = json.RawMessage("[]")

// SaveRequest는 캔버스 요소 증분 저장 요청(CanvasSaveRequest)과 동일한 형태다.
type SaveRequest struct {
	MutationID         string          `json:"mutationId"`
	AddedLines         json.RawMessage `json:"addedLines"`
	ModifiedLines      json.RawMessage `json:"modifiedLines"`
	DeletedLines       json.RawMessage `json:"deletedLines"`
	AddedImages        json.RawMessage `json:"addedImages"`
	ModifiedImages     json.RawMessage `json:"modifiedImages"`
	DeletedImages      json.RawMessage `json:"deletedImages"`
	AddedTextBoxes     json.RawMessage `json:"addedTextBoxes"`
	ModifiedTextBoxes  json.RawMessage `json:"modifiedTextBoxes"`
	DeletedTextBoxes   json.RawMessage `json:"deletedTextBoxes"`
	Trigger            string          `json:"trigger"`
	OperationID        string          `json:"operationId"`
	ClientCreatedAt    string          `json:"clientCreatedAt"`
}

// SaveResponse는 CanvasSaveResponse와 동일하다.
type SaveResponse struct {
	MutationID    string `json:"mutationId"`
	Revision      int64  `json:"revision"`
	Duplicate     bool   `json:"duplicate"`
	StorageStatus string `json:"storageStatus"`
}

// MetadataResponse는 CanvasMetadataResponse와 동일하다.
type MetadataResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Revision  int64     `json:"revision"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ElementsResponse는 CanvasElementsResponse와 동일하다.
type ElementsResponse struct {
	Lines          json.RawMessage  `json:"lines"`
	Images         json.RawMessage  `json:"images"`
	TextBoxes      json.RawMessage  `json:"textBoxes"`
	Revision       *int64           `json:"revision"`
	Status         string           `json:"status"`
	Source         string           `json:"source"`
	FailedElements []string         `json:"failedElements"`
	Warnings       []string         `json:"warnings"`
	Timings        map[string]int64 `json:"timings"`
}

// CanvasResponse는 CanvasResponse(로드)와 동일하다.
type CanvasResponse struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Lines     json.RawMessage `json:"lines"`
	Images    json.RawMessage `json:"images"`
	TextBoxes json.RawMessage `json:"textBoxes"`
}

// ViewportRequest는 CanvasViewportRequest와 동일하다.
type ViewportRequest struct {
	OffsetX float64 `json:"offsetX"`
	OffsetY float64 `json:"offsetY"`
	Scale   float64 `json:"scale"`
}

// ViewportResponse는 CanvasViewportResponse와 동일하다.
type ViewportResponse struct {
	CanvasID  string    `json:"canvasId"`
	OffsetX   float64   `json:"offsetX"`
	OffsetY   float64   `json:"offsetY"`
	Scale     float64   `json:"scale"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SummaryResponse는 CanvasSummaryResponse와 동일하다.
type SummaryResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DocumentRequest는 문서 생성/수정 본문이다.
type DocumentRequest struct {
	Title string `json:"title"`
}

// FolderRequest는 폴더 생성/수정 본문이다(canvas_ids는 snake_case).
type FolderRequest struct {
	Category  *string  `json:"category"`
	Name      *string  `json:"name"`
	CanvasIDs []string `json:"canvas_ids"`
}

// FolderResponse는 CanvasFolderResponse와 동일하다.
type FolderResponse struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Name      string    `json:"name"`
	CanvasIDs []string  `json:"canvasIds"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AssetResponse는 CanvasAssetResponse와 동일하다.
type AssetResponse struct {
	ID          string `json:"id"`
	ObjectKey   string `json:"objectKey"`
	URL         string `json:"url"`
	ContentType string `json:"contentType"`
	ByteSize    int64  `json:"byteSize"`
}
