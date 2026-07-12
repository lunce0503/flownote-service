package canvas

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/flownote/flownote-canvas/internal/httpjson"
	"github.com/flownote/flownote-canvas/internal/storage"
)

// Handler는 캔버스 HTTP 엔드포인트를 제공한다. Spring CanvasController와 동일한 경로/계약.
type Handler struct {
	repo         *Repo
	store        *storage.Store
	auth         *auth.Authenticator
	assetURLBase string // 자산 프록시 URL 베이스(비면 스토리지 공개 URL 사용)
}

func NewHandler(repo *Repo, store *storage.Store, authenticator *auth.Authenticator) *Handler {
	return &Handler{repo: repo, store: store, auth: authenticator}
}

// Register는 라우트를 mux에 등록한다. 자산 GET과 health는 공개, 나머지는 인증 필요(Spring과 동일).
func (h *Handler) Register(mux *http.ServeMux) {
	// 공개: 자산 조회는 Spring에서도 인증이 없다.
	mux.HandleFunc("GET /api/canvas/assets/by-key", h.assetByKey)
	mux.HandleFunc("GET /api/canvas/assets/{assetId}", h.assetByID)

	// 인증 필요.
	p := func(fn http.HandlerFunc) http.Handler { return h.auth.Middleware(fn) }
	mux.Handle("GET /api/canvas/load", p(h.load))
	mux.Handle("GET /api/canvas", p(h.load))
	mux.Handle("POST /api/canvas/save", p(h.save))

	// GET metadata/elements/viewport는 쿼리 형식(?canvasId=)만 등록한다.
	// path-form {canvasId}를 3번째 세그먼트에 두면 /api/canvas/assets/{assetId} 등 정적 경로와
	// Go 1.22 ServeMux에서 충돌하므로, 실제로 쓰이지 않는 GET path-form은 생략한다.
	mux.Handle("GET /api/canvas/metadata", p(h.metadata))
	mux.Handle("GET /api/canvas/elements", p(h.elements))
	mux.Handle("POST /api/canvas/elements/save", p(h.saveElements))
	mux.Handle("POST /api/canvas/{canvasId}/elements/save", p(h.saveElements))
	mux.Handle("GET /api/canvas/viewport", p(h.viewport))
	mux.Handle("PUT /api/canvas/{canvasId}/viewport", p(h.saveViewport))

	mux.Handle("POST /api/canvas/assets", p(h.uploadAsset))

	mux.Handle("GET /api/canvas/documents", p(h.listDocuments))
	mux.Handle("POST /api/canvas/documents", p(h.createDocument))
	mux.Handle("PATCH /api/canvas/documents/{canvasId}", p(h.updateDocument))
	mux.Handle("DELETE /api/canvas/documents/{canvasId}", p(h.deleteDocument))

	mux.Handle("GET /api/canvas/folders", p(h.listFolders))
	mux.Handle("POST /api/canvas/folders", p(h.createFolder))
	mux.Handle("PATCH /api/canvas/folders/{folderId}", p(h.updateFolder))
	mux.Handle("DELETE /api/canvas/folders/{folderId}", p(h.deleteFolder))
	mux.Handle("POST /api/canvas/folders/{folderId}/documents/{canvasId}", p(h.addDocumentToFolder))
	mux.Handle("DELETE /api/canvas/folders/{folderId}/documents/{canvasId}", p(h.removeDocumentFromFolder))
}

// canvasIDFrom은 경로 변수 또는 canvasId 쿼리에서 캔버스 id를 얻는다(둘 다 없으면 빈 문자열).
func canvasIDFrom(r *http.Request) string {
	if id := r.PathValue("canvasId"); id != "" {
		return id
	}
	return strings.TrimSpace(r.URL.Query().Get("canvasId"))
}

func (h *Handler) load(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	resp, err := h.repo.Load(r.Context(), userID, canvasIDFrom(r))
	respond(w, resp, err)
}

func (h *Handler) save(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	var req SaveRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	// 레거시 /save: mutationId가 없으면 생성해 요소 저장 경로로 위임한 뒤 최신 캔버스를 반환한다.
	if strings.TrimSpace(req.MutationID) == "" {
		req.MutationID = genUUID()
	}
	if _, err := h.repo.SaveElements(r.Context(), userID, canvasIDFrom(r), req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.Load(r.Context(), userID, canvasIDFrom(r))
	respond(w, resp, err)
}

func (h *Handler) metadata(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	resp, err := h.repo.Metadata(r.Context(), userID, canvasIDFrom(r))
	respond(w, resp, err)
}

func (h *Handler) elements(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	resp, err := h.repo.Elements(r.Context(), userID, canvasIDFrom(r))
	respond(w, resp, err)
}

func (h *Handler) saveElements(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	var req SaveRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.SaveElements(r.Context(), userID, canvasIDFrom(r), req)
	respond(w, resp, err)
}

func (h *Handler) viewport(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	resp, err := h.repo.Viewport(r.Context(), userID, canvasIDFrom(r))
	respond(w, resp, err)
}

func (h *Handler) saveViewport(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	var req ViewportRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.SaveViewport(r.Context(), userID, r.PathValue("canvasId"), req)
	respond(w, resp, err)
}

func (h *Handler) listDocuments(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.ListDocuments(r.Context(), auth.UserID(r.Context()))
	respond(w, resp, err)
}

func (h *Handler) createDocument(w http.ResponseWriter, r *http.Request) {
	var req DocumentRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.CreateDocument(r.Context(), auth.UserID(r.Context()), req)
	respond(w, resp, err)
}

func (h *Handler) updateDocument(w http.ResponseWriter, r *http.Request) {
	var req DocumentRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.UpdateDocument(r.Context(), auth.UserID(r.Context()), r.PathValue("canvasId"), req)
	respond(w, resp, err)
}

func (h *Handler) deleteDocument(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteDocument(r.Context(), auth.UserID(r.Context()), r.PathValue("canvasId")); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listFolders(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.ListFolders(r.Context(), auth.UserID(r.Context()))
	respond(w, resp, err)
}

func (h *Handler) createFolder(w http.ResponseWriter, r *http.Request) {
	var req FolderRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.CreateFolder(r.Context(), auth.UserID(r.Context()), req)
	respond(w, resp, err)
}

func (h *Handler) updateFolder(w http.ResponseWriter, r *http.Request) {
	var req FolderRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	resp, err := h.repo.UpdateFolder(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId"), req)
	respond(w, resp, err)
}

func (h *Handler) deleteFolder(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteFolder(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId")); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) addDocumentToFolder(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.AddDocumentToFolder(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId"), r.PathValue("canvasId"))
	respond(w, resp, err)
}

func (h *Handler) removeDocumentFromFolder(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.RemoveDocumentFromFolder(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId"), r.PathValue("canvasId"))
	respond(w, resp, err)
}

func (h *Handler) uploadAsset(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r.Context())
	if h.store == nil || !h.store.Configured() {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusServiceUnavailable, "Object storage가 설정되지 않았습니다."))
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "업로드할 이미지가 필요합니다."))
		return
	}
	file, header, err := firstFile(r)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	defer file.Close()
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "이미지 파일만 업로드할 수 있습니다."))
		return
	}
	data, err := io.ReadAll(file)
	if err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusInternalServerError, "이미지를 읽을 수 없습니다."))
		return
	}
	objectKey := fmt.Sprintf("canvas/%s/%s%s", userID, genUUID(), extensionFor(contentType, header.Filename))
	publicURL, err := h.store.Put(r.Context(), objectKey, contentType, data)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	assetID, err := h.repo.InsertAsset(r.Context(), userID, objectKey, contentType, int64(len(data)))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	// Spring과 동일하게 이 서비스의 자산 프록시 URL(<scheme>://<host>/api/canvas/assets/<id>)을 돌려준다.
	base := h.assetURLBase
	if base == "" {
		base = requestBaseURL(r) + "/api/canvas/assets"
	}
	url := strings.TrimRight(base, "/") + "/" + assetID
	if url == "/"+assetID && publicURL != "" {
		url = publicURL
	}
	respond(w, AssetResponse{ID: assetID, ObjectKey: objectKey, URL: url, ContentType: contentType, ByteSize: int64(len(data))}, nil)
}

func (h *Handler) assetByID(w http.ResponseWriter, r *http.Request) {
	objectKey, contentType, _, err := h.repo.AssetByID(r.Context(), r.PathValue("assetId"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	obj, err := h.store.Get(r.Context(), objectKey)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	writeBytes(w, firstNonEmptyStr(contentType, obj.ContentType), obj.Data)
}

func (h *Handler) assetByKey(w http.ResponseWriter, r *http.Request) {
	objectKey := strings.TrimSpace(r.URL.Query().Get("objectKey"))
	if objectKey == "" {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "objectKey가 필요합니다."))
		return
	}
	obj, err := h.store.Get(r.Context(), objectKey)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !strings.HasPrefix(obj.ContentType, "image/") {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "이미지 파일만 읽을 수 있습니다."))
		return
	}
	writeBytes(w, obj.ContentType, obj.Data)
}

// ---- 응답 헬퍼 ----

func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, value)
}

func decodeJSON(r *http.Request, target any) error {
	if r.Body == nil {
		return nil
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(target); err != nil && err != io.EOF {
		return httpjson.Errorf(http.StatusBadRequest, "요청 본문을 해석할 수 없습니다.")
	}
	return nil
}

func writeBytes(w http.ResponseWriter, contentType string, data []byte) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func firstFile(r *http.Request) (io.ReadCloser, *fileHeaderLite, error) {
	if r.MultipartForm == nil {
		return nil, nil, httpjson.Errorf(http.StatusBadRequest, "업로드할 이미지가 필요합니다.")
	}
	for _, name := range []string{"image", "file"} {
		if fhs := r.MultipartForm.File[name]; len(fhs) > 0 {
			f, err := fhs[0].Open()
			if err != nil {
				return nil, nil, httpjson.Errorf(http.StatusBadRequest, "업로드 파일을 열 수 없습니다.")
			}
			return f, &fileHeaderLite{Filename: fhs[0].Filename, Header: fhs[0].Header}, nil
		}
	}
	// 필드명 무관 첫 파일.
	for _, fhs := range r.MultipartForm.File {
		if len(fhs) > 0 {
			f, err := fhs[0].Open()
			if err != nil {
				return nil, nil, httpjson.Errorf(http.StatusBadRequest, "업로드 파일을 열 수 없습니다.")
			}
			return f, &fileHeaderLite{Filename: fhs[0].Filename, Header: fhs[0].Header}, nil
		}
	}
	return nil, nil, httpjson.Errorf(http.StatusBadRequest, "업로드할 이미지가 필요합니다.")
}

type fileHeaderLite struct {
	Filename string
	Header   interface{ Get(string) string }
}

func extensionFor(contentType, filename string) string {
	if i := strings.LastIndex(filename, "."); i >= 0 && i < len(filename)-1 {
		return filename[i:]
	}
	switch contentType {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}

func firstNonEmptyStr(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// requestBaseURL은 프록시 헤더를 고려해 <scheme>://<host>를 만든다.
func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if xf := r.Header.Get("X-Forwarded-Proto"); xf != "" {
		scheme = xf
	}
	host := r.Host
	if xh := r.Header.Get("X-Forwarded-Host"); xh != "" {
		host = xh
	}
	return scheme + "://" + host
}

// genUUID는 랜덤 UUIDv4 문자열을 만든다.
func genUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
