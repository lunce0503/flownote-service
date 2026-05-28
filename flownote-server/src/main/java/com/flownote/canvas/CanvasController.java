package com.flownote.canvas;

import java.util.UUID;
import java.util.List;

import org.springframework.validation.annotation.Validated;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.flownote.auth.AuthService;
import com.flownote.canvas.CanvasDtos.CanvasAssetResponse;
import com.flownote.canvas.CanvasDtos.CanvasDocumentRequest;
import com.flownote.canvas.CanvasDtos.CanvasDocumentUpdateRequest;
import com.flownote.canvas.CanvasDtos.CanvasElementsResponse;
import com.flownote.canvas.CanvasDtos.CanvasFolderRequest;
import com.flownote.canvas.CanvasDtos.CanvasFolderResponse;
import com.flownote.canvas.CanvasDtos.CanvasFolderUpdateRequest;
import com.flownote.canvas.CanvasDtos.CanvasMetadataResponse;
import com.flownote.canvas.CanvasDtos.CanvasResponse;
import com.flownote.canvas.CanvasDtos.CanvasSaveRequest;
import com.flownote.canvas.CanvasDtos.CanvasSummaryResponse;
import com.flownote.canvas.CanvasDtos.CanvasViewportRequest;
import com.flownote.canvas.CanvasDtos.CanvasViewportResponse;
import com.flownote.canvas.CanvasService.CanvasAssetContent;

@RestController
@RequestMapping("/api/canvas")
public class CanvasController {
    private final AuthService authService;
    private final CanvasService canvasService;

    public CanvasController(AuthService authService, CanvasService canvasService) {
        this.authService = authService;
        this.canvasService = canvasService;
    }

    @GetMapping({"/load", ""})
    public CanvasResponse load(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId) {
        UUID userId = authService.requireUserId(authorization);
        return canvasService.load(userId, canvasId);
    }

    @PostMapping("/save")
    public CanvasResponse save(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId,
            @Validated @RequestBody CanvasSaveRequest request) {
        UUID userId = authService.requireUserId(authorization);
        return canvasService.save(userId, canvasId, request);
    }

    @GetMapping("/{canvasId}/metadata")
    public CanvasMetadataResponse metadataById(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId) {
        return canvasService.metadata(authService.requireUserId(authorization), canvasId);
    }

    @GetMapping("/metadata")
    public CanvasMetadataResponse metadataByQuery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId) {
        return canvasService.metadata(authService.requireUserId(authorization), canvasId);
    }

    @GetMapping("/{canvasId}/elements")
    public CanvasElementsResponse elementsById(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId) {
        return canvasService.elements(authService.requireUserId(authorization), canvasId);
    }

    @GetMapping("/elements")
    public CanvasElementsResponse elementsByQuery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId) {
        return canvasService.elements(authService.requireUserId(authorization), canvasId);
    }

    @PostMapping("/{canvasId}/elements/save")
    public CanvasElementsResponse saveElementsById(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId,
            @Validated @RequestBody CanvasSaveRequest request) {
        return canvasService.saveElements(authService.requireUserId(authorization), canvasId, request);
    }

    @PostMapping("/elements/save")
    public CanvasElementsResponse saveElementsByQuery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId,
            @Validated @RequestBody CanvasSaveRequest request) {
        return canvasService.saveElements(authService.requireUserId(authorization), canvasId, request);
    }

    @GetMapping("/{canvasId}/viewport")
    public CanvasViewportResponse viewportById(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId) {
        return canvasService.viewport(authService.requireUserId(authorization), canvasId);
    }

    @GetMapping("/viewport")
    public CanvasViewportResponse viewportByQuery(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "canvasId", required = false) UUID canvasId) {
        return canvasService.viewport(authService.requireUserId(authorization), canvasId);
    }

    @PutMapping("/{canvasId}/viewport")
    public CanvasViewportResponse saveViewport(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId,
            @RequestBody CanvasViewportRequest request) {
        return canvasService.saveViewport(authService.requireUserId(authorization), canvasId, request);
    }

    @PostMapping(value = "/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CanvasAssetResponse uploadAsset(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestPart("image") MultipartFile image) {
        String assetUrlBase = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/canvas/assets")
                .toUriString();
        return canvasService.uploadAsset(authService.requireUserId(authorization), image, assetUrlBase);
    }

    @GetMapping("/assets/{assetId}")
    public ResponseEntity<byte[]> asset(@PathVariable UUID assetId) {
        CanvasAssetContent content = canvasService.readAsset(assetId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(content.byteSize()))
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(30)).cachePublic().noTransform())
                .body(content.bytes());
    }

    @GetMapping("/documents")
    public List<CanvasSummaryResponse> documents(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return canvasService.listDocuments(authService.requireUserId(authorization));
    }

    @PostMapping("/documents")
    public CanvasSummaryResponse createDocument(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CanvasDocumentRequest request) {
        return canvasService.createDocument(authService.requireUserId(authorization), request);
    }

    @PatchMapping("/documents/{canvasId}")
    public CanvasSummaryResponse updateDocument(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId,
            @RequestBody CanvasDocumentUpdateRequest request) {
        return canvasService.updateDocument(authService.requireUserId(authorization), canvasId, request);
    }

    @DeleteMapping("/documents/{canvasId}")
    public ResponseEntity<Void> deleteDocument(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID canvasId) {
        canvasService.deleteDocument(authService.requireUserId(authorization), canvasId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/folders")
    public List<CanvasFolderResponse> folders(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return canvasService.listFolders(authService.requireUserId(authorization));
    }

    @PostMapping("/folders")
    public CanvasFolderResponse createFolder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CanvasFolderRequest request) {
        return canvasService.createFolder(authService.requireUserId(authorization), request);
    }

    @PatchMapping("/folders/{folderId}")
    public CanvasFolderResponse updateFolder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @RequestBody CanvasFolderUpdateRequest request) {
        return canvasService.updateFolder(authService.requireUserId(authorization), folderId, request);
    }

    @DeleteMapping("/folders/{folderId}")
    public ResponseEntity<Void> deleteFolder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId) {
        canvasService.deleteFolder(authService.requireUserId(authorization), folderId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/folders/{folderId}/documents/{canvasId}")
    public CanvasFolderResponse addDocumentToFolder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @PathVariable UUID canvasId) {
        return canvasService.addDocumentToFolder(authService.requireUserId(authorization), folderId, canvasId);
    }

    @DeleteMapping("/folders/{folderId}/documents/{canvasId}")
    public CanvasFolderResponse removeDocumentFromFolder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable UUID folderId,
            @PathVariable UUID canvasId) {
        return canvasService.removeDocumentFromFolder(authService.requireUserId(authorization), folderId, canvasId);
    }
}
