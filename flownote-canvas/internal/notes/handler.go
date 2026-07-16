package notes

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/flownote/flownote-canvas/internal/auth"
	"github.com/flownote/flownote-canvas/internal/httpjson"
)

// Handler는 Spring NoteController/NoteFolderController/UploadController를 이식한 HTTP 계층이다.
type Handler struct {
	repo      *Repo
	auth      *auth.Authenticator
	uploadDir string
}

func NewHandler(repo *Repo, authenticator *auth.Authenticator, uploadDir string) *Handler {
	return &Handler{repo: repo, auth: authenticator, uploadDir: uploadDir}
}

func (h *Handler) Register(mux *http.ServeMux) {
	p := func(fn http.HandlerFunc) http.Handler { return h.auth.Middleware(fn) }

	mux.Handle("GET /api/notes", p(h.list))
	mux.Handle("POST /api/notes", p(h.upsert))
	mux.Handle("PATCH /api/notes/{noteId}", p(h.updateTitle))
	mux.Handle("DELETE /api/notes/{noteId}", p(h.deleteNote))

	mux.Handle("GET /api/note-folders", p(h.listFolders))
	mux.Handle("POST /api/note-folders", p(h.createFolder))
	mux.Handle("PATCH /api/note-folders/{folderId}", p(h.updateFolder))
	mux.Handle("DELETE /api/note-folders/{folderId}", p(h.deleteFolder))
	mux.Handle("POST /api/note-folders/{folderId}/notes/{noteId}", p(h.addNoteToFolder))
	mux.Handle("DELETE /api/note-folders/{folderId}/notes/{noteId}", p(h.removeNoteFromFolder))

	// 노트 에디터 이미지 업로드(Spring UploadController와 동일 경로·응답).
	mux.Handle("POST /api/upload", p(h.upload))
	mux.Handle("POST /api/notes/upload", p(h.upload))
	// 업로드 파일 정적 서빙(Spring UploadResourceConfig와 동일하게 인증 없음).
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(h.uploadDir))))
}

func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, value)
}

func decodeJSON(r *http.Request, target any) error {
	if r.Body == nil {
		return httpjson.Errorf(http.StatusBadRequest, "요청 본문이 필요합니다.")
	}
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		return httpjson.Errorf(http.StatusBadRequest, "요청 본문 형식이 올바르지 않습니다.")
	}
	return nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.List(r.Context(), auth.UserID(r.Context()))
	respond(w, resp, err)
}

func (h *Handler) upsert(w http.ResponseWriter, r *http.Request) {
	var req NoteRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !isUUID(req.ID) ||
		strings.TrimSpace(req.Title) == "" || len(req.Content) == 0 ||
		req.Revision <= 0 || strings.TrimSpace(req.ClientID) == "" {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "노트 요청 값이 올바르지 않습니다."))
		return
	}
	resp, err := h.repo.Upsert(r.Context(), auth.UserID(r.Context()), req)
	respond(w, resp, err)
}

func (h *Handler) updateTitle(w http.ResponseWriter, r *http.Request) {
	var req NoteTitleUpdateRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if strings.TrimSpace(req.Title) == "" || req.Revision <= 0 || strings.TrimSpace(req.ClientID) == "" {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "노트 요청 값이 올바르지 않습니다."))
		return
	}
	resp, err := h.repo.UpdateTitle(r.Context(), auth.UserID(r.Context()), r.PathValue("noteId"), req)
	respond(w, resp, err)
}

func (h *Handler) deleteNote(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("noteId"))
	respond(w, resp, err)
}

func (h *Handler) listFolders(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.ListFolders(r.Context(), auth.UserID(r.Context()))
	respond(w, resp, err)
}

func (h *Handler) createFolder(w http.ResponseWriter, r *http.Request) {
	var req FolderCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "폴더 이름이 필요합니다."))
		return
	}
	resp, err := h.repo.CreateFolder(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/note-folders/"+resp.ID)
	httpjson.Write(w, http.StatusCreated, resp)
}

func (h *Handler) updateFolder(w http.ResponseWriter, r *http.Request) {
	var req FolderUpdateRequest
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

func (h *Handler) addNoteToFolder(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.AddNote(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId"), r.PathValue("noteId"))
	respond(w, resp, err)
}

func (h *Handler) removeNoteFromFolder(w http.ResponseWriter, r *http.Request) {
	resp, err := h.repo.RemoveNote(r.Context(), auth.UserID(r.Context()), r.PathValue("folderId"), r.PathValue("noteId"))
	respond(w, resp, err)
}

// upload는 multipart(image 우선, 없으면 file)를 받아 UploadDir에 저장하고
// Spring과 동일한 {"filename","fileUrl":"/uploads/..."} 응답을 준다.
func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "업로드 형식이 올바르지 않습니다."))
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		file, header, err = r.FormFile("file")
	}
	if err != nil || header == nil || header.Size == 0 {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "업로드할 파일이 필요합니다."))
		return
	}
	defer file.Close()

	if err := os.MkdirAll(h.uploadDir, 0o755); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusInternalServerError, "파일 업로드에 실패했습니다."))
		return
	}
	filename := newUUID() + "-" + sanitizeFilename(header.Filename)
	dst, err := os.Create(filepath.Join(h.uploadDir, filename))
	if err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusInternalServerError, "파일 업로드에 실패했습니다."))
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusInternalServerError, "파일 업로드에 실패했습니다."))
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]string{
		"filename": filename,
		"fileUrl":  "/uploads/" + filename,
	})
}

// sanitizeFilename은 Spring UploadController.sanitize와 동일한 규칙으로 파일명을 정리한다.
func sanitizeFilename(name string) string {
	base := strings.TrimSpace(name)
	if base == "" {
		base = "file"
	}
	base = filepath.Base(strings.ReplaceAll(base, "\\", "/"))
	var b strings.Builder
	for _, ch := range base {
		if ch == '.' || ch == '_' || ch == '-' ||
			(ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
			ch > 127 { // Java Character.isLetterOrDigit는 유니코드 문자 허용
			b.WriteRune(ch)
			continue
		}
		b.WriteRune('_')
	}
	if b.Len() == 0 {
		return "file"
	}
	return b.String()
}

// newUUID는 crypto/rand 기반 UUIDv4 문자열을 만든다(외부 의존성 회피).
func newUUID() string {
	var u [16]byte
	if _, err := rand.Read(u[:]); err != nil {
		return fmt.Sprintf("%d", os.Getpid())
	}
	u[6] = (u[6] & 0x0f) | 0x40
	u[8] = (u[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", u[0:4], u[4:6], u[6:8], u[8:10], u[10:16])
}

// isUUID는 8-4-4-4-12 형식을 가볍게 검사한다(auth.isUUID와 동일 규칙).
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
				return false
			}
		}
	}
	return true
}
