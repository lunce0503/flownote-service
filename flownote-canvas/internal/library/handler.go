package library

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strconv"

	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/flownote/flownote-canvas/internal/httpjson"
)

type Handler struct {
	repo *Repo
	auth *auth.Authenticator
}

func NewHandler(repo *Repo, a *auth.Authenticator) *Handler { return &Handler{repo, a} }
func (h *Handler) Register(mux *http.ServeMux) {
	protect := func(fn http.HandlerFunc) http.Handler {
		return h.auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Flownote-Owner", auth.UserID(r.Context()))
			if expected := r.Header.Get("X-Flownote-Expected-Owner"); expected != "" && expected != auth.UserID(r.Context()) {
				httpjson.WriteError(w, httpjson.Errorf(409, "화면의 계정과 서버 로그인 계정이 다릅니다. 다시 로그인해 주세요."))
				return
			}
			for _, name := range []string{"bookID", "uploadID", "termID"} {
				if v := r.PathValue(name); v != "" && !validID(v) {
					httpjson.WriteError(w, httpjson.Errorf(400, "식별자가 올바르지 않습니다."))
					return
				}
			}
			fn(w, r)
		}))
	}
	mux.Handle("GET /api/library/books", protect(h.list))
	mux.Handle("GET /api/library/books/{bookID}", protect(h.get))
	mux.Handle("PATCH /api/library/books/{bookID}", protect(h.patch))
	mux.Handle("DELETE /api/library/books/{bookID}", protect(h.delete))
	mux.Handle("GET /api/library/books/{bookID}/file", protect(h.file))
	mux.Handle("POST /api/library/uploads", protect(h.start))
	mux.Handle("PUT /api/library/uploads/{uploadID}/chunks/{part}", protect(h.chunk))
	mux.Handle("POST /api/library/uploads/{uploadID}/complete", protect(h.complete))
	mux.Handle("GET /api/library/books/{bookID}/terms", protect(h.terms))
	mux.Handle("POST /api/library/books/{bookID}/lookup", protect(h.lookup))
	mux.Handle("POST /api/library/books/{bookID}/terms", protect(h.saveTerm))
	mux.Handle("DELETE /api/library/books/{bookID}/terms/{termID}", protect(h.deleteTerm))
}
func decode(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return httpjson.Errorf(400, "요청 형식이 올바르지 않습니다.")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return httpjson.Errorf(400, "요청 형식이 올바르지 않습니다.")
	}
	return nil
}
func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, 200, value)
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	books, next, err := h.repo.List(r.Context(), auth.UserID(r.Context()), r.URL.Query().Get("cursor"))
	respond(w, map[string]any{"books": books, "nextCursor": next}, err)
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	b, err := h.repo.Get(r.Context(), auth.UserID(r.Context()), r.PathValue("bookID"))
	respond(w, b, err)
}
func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Book Book `json:"book"`
	}
	if err := decode(w, r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	if err := req.Book.Validate(); err != nil {
		respond(w, nil, err)
		return
	}
	upload, err := h.repo.StartUpload(r.Context(), auth.UserID(r.Context()), req.Book)
	respond(w, upload, err)
}
func (h *Handler) chunk(w http.ResponseWriter, r *http.Request) {
	part, err := strconv.Atoi(r.PathValue("part"))
	if err != nil || part < 0 || part >= 100 {
		respond(w, nil, httpjson.Errorf(400, "PDF 조각 번호가 올바르지 않습니다."))
		return
	}
	b, err := h.repo.UploadBook(r.Context(), auth.UserID(r.Context()), r.PathValue("uploadID"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	expected := chunkSize(b.Bytes, part)
	if expected == 0 {
		respond(w, nil, httpjson.Errorf(400, "PDF 조각이 범위를 벗어났습니다."))
		return
	}
	hash := r.Header.Get("X-Chunk-Sha256")
	digest, err := hex.DecodeString(hash)
	if err != nil || len(digest) != sha256.Size {
		respond(w, nil, httpjson.Errorf(400, "PDF 조각 해시가 필요합니다."))
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, expected+1))
	if err != nil || int64(len(data)) != expected {
		respond(w, nil, httpjson.Errorf(413, "PDF 조각 크기가 다릅니다."))
		return
	}
	err = h.repo.PutChunk(r.Context(), auth.UserID(r.Context()), r.PathValue("uploadID"), part, data, hash)
	respond(w, map[string]bool{"ok": true}, err)
}
func (h *Handler) complete(w http.ResponseWriter, r *http.Request) {
	b, err := h.repo.Complete(r.Context(), auth.UserID(r.Context()), r.PathValue("uploadID"))
	respond(w, b, err)
}
func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Revision int64   `json:"revision"`
		Changes  Changes `json:"changes"`
	}
	if err := decode(w, r, &req); err != nil {
		respond(w, nil, err)
		return
	}
	if req.Revision < 1 {
		respond(w, nil, httpjson.Errorf(400, "책 revision이 필요합니다."))
		return
	}
	b, err := h.repo.Patch(r.Context(), auth.UserID(r.Context()), r.PathValue("bookID"), req.Revision, req.Changes)
	respond(w, b, err)
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	revision, err := strconv.ParseInt(r.URL.Query().Get("revision"), 10, 64)
	if err != nil || revision < 1 {
		respond(w, nil, httpjson.Errorf(400, "책 revision이 필요합니다."))
		return
	}
	err = h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("bookID"), revision)
	respond(w, map[string]bool{"ok": true}, err)
}
func validatePart(data []byte, p Part) error {
	sum := sha256.Sum256(data)
	if int64(len(data)) != p.Bytes || hex.EncodeToString(sum[:]) != p.SHA256 {
		return httpjson.Errorf(502, "원본 PDF 검증에 실패했습니다. 다시 시도해 주세요.")
	}
	return nil
}
func (h *Handler) file(w http.ResponseWriter, r *http.Request) {
	b, parts, err := h.repo.File(r.Context(), auth.UserID(r.Context()), r.PathValue("bookID"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	if len(parts) != chunkCount(b.Bytes) {
		respond(w, nil, httpjson.Errorf(502, "원본 PDF 조각을 확인하지 못했습니다."))
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": b.Filename}))
	w.Header().Set("Content-Length", strconv.FormatInt(b.Bytes, 10))
	for i, p := range parts {
		object, readErr := h.repo.store.Get(r.Context(), p.Key)
		if readErr == nil {
			readErr = validatePart(object.Data, p)
		}
		if readErr != nil {
			if i == 0 {
				w.Header().Del("Content-Length")
				respond(w, nil, readErr)
			}
			return
		}
		if _, err = w.Write(object.Data); err != nil {
			return
		}
	}
}
