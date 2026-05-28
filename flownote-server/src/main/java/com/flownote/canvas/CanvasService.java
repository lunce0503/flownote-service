package com.flownote.canvas;

import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.http.HttpStatus;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.flownote.canvas.CanvasAssetStorage.StoredCanvasAsset;
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

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

@Service
public class CanvasService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final CanvasAssetStorage assetStorage;
    private final CanvasElementCacheService elementCacheService;

    public CanvasService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            CanvasAssetStorage assetStorage,
            CanvasElementCacheService elementCacheService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.assetStorage = assetStorage;
        this.elementCacheService = elementCacheService;
    }

    public CanvasResponse load(UUID userId, UUID canvasId) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        return getCanvas(userId, targetCanvasId);
    }

    @Transactional
    public CanvasResponse save(UUID userId, UUID canvasId, CanvasSaveRequest request) {
        CanvasResponse current = load(userId, canvasId);
        JsonNode lines = merge(current.lines(), request.addedLines(), request.modifiedLines(), request.deletedLines());
        JsonNode images = merge(current.images(), request.addedImages(), request.modifiedImages(), request.deletedImages());
        JsonNode textBoxes = merge(current.textBoxes(), request.addedTextBoxes(), request.modifiedTextBoxes(), request.deletedTextBoxes());

        jdbcTemplate.update("""
                UPDATE canvas_documents
                SET lines = '[]'::jsonb,
                    images = '[]'::jsonb,
                    text_boxes = '[]'::jsonb,
                    revision = revision + 1,
                    updated_at = NOW()
                WHERE id = ? AND user_id = ?
                """, current.id(), userId);
        syncElements(userId, current.id(), lines, images, textBoxes);
        return new CanvasResponse(current.id(), current.title(), lines, images, textBoxes);
    }

    public CanvasMetadataResponse metadata(UUID userId, UUID canvasId) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        return jdbcTemplate.query("""
                SELECT id, title, revision, created_at, updated_at
                FROM canvas_documents
                WHERE id = ? AND user_id = ?
                """, this::mapMetadata, targetCanvasId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스를 찾을 수 없습니다."));
    }

    public CanvasElementsResponse elements(UUID userId, UUID canvasId) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        long revision = getCanvasRevision(userId, targetCanvasId);
        Optional<CanvasElementsResponse> cached = elementCacheService.get(userId, targetCanvasId, revision);
        if (cached.isPresent()) {
            return cached.get();
        }

        CanvasElementsResponse response;
        CanvasElementArrays elementArrays = readElementArrays(userId, targetCanvasId);
        if (elementArrays.hasRows()) {
            response = new CanvasElementsResponse(elementArrays.lines(), elementArrays.images(), elementArrays.textBoxes());
        } else {
            CanvasResponse canvas = getStoredCanvasJson(userId, targetCanvasId);
            response = new CanvasElementsResponse(canvas.lines(), canvas.images(), canvas.textBoxes());
        }
        elementCacheService.put(userId, targetCanvasId, revision, response);
        return response;
    }

    private CanvasElementArrays readElementArrays(UUID userId, UUID canvasId) {
        CanvasElementArrays snapshot = readElementSnapshot(userId, canvasId);
        if (snapshot.hasRows()) {
            return snapshot;
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT type, payload::text AS payload, object_key
                FROM canvas_elements
                WHERE canvas_id = ? AND user_id = ?
                ORDER BY created_at ASC
                """, canvasId, userId);
        CanvasElementArrays arrays = buildElementArrays(rows);
        if (arrays.hasRows()) {
            writeElementSnapshot(userId, canvasId, arrays);
        }
        return arrays;
    }

    private CanvasElementArrays buildElementArrays(List<Map<String, Object>> rows) {
        ArrayNode lines = emptyArray();
        ArrayNode images = emptyArray();
        ArrayNode textBoxes = emptyArray();
        if (rows.isEmpty()) {
            return new CanvasElementArrays(lines, images, textBoxes, false);
        }

        ExecutorService executor = Executors.newFixedThreadPool(Math.min(24, Math.max(1, rows.size())));
        try {
            List<CanvasElementPayload> payloads = rows.stream()
                    .map(row -> CompletableFuture.supplyAsync(() -> readElementPayload(row), executor))
                    .map(CompletableFuture::join)
                    .toList();
            payloads.forEach(element -> {
                switch (element.type()) {
                    case "line" -> lines.add(element.payload());
                    case "image" -> images.add(element.payload());
                    case "textBox" -> textBoxes.add(element.payload());
                    default -> {
                    }
                }
            });
        } finally {
            executor.shutdown();
        }
        return new CanvasElementArrays(lines, images, textBoxes, !rows.isEmpty());
    }

    private CanvasElementPayload readElementPayload(Map<String, Object> row) {
        String objectKey = row.get("object_key") == null ? "" : String.valueOf(row.get("object_key"));
        JsonNode payload = objectKey.isBlank()
                ? readJson(String.valueOf(row.get("payload")))
                : readJson(assetStorage.readJson(objectKey));
        return new CanvasElementPayload(String.valueOf(row.get("type")), payload);
    }

    @Transactional
    public CanvasElementsResponse saveElements(UUID userId, UUID canvasId, CanvasSaveRequest request) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        invalidateElementSnapshot(userId, targetCanvasId);
        deleteElements(userId, targetCanvasId, "line", request == null ? null : request.deletedLines());
        deleteElements(userId, targetCanvasId, "image", request == null ? null : request.deletedImages());
        deleteElements(userId, targetCanvasId, "textBox", request == null ? null : request.deletedTextBoxes());
        upsertElements(userId, targetCanvasId, "line", request == null ? null : request.addedLines());
        upsertElements(userId, targetCanvasId, "line", request == null ? null : request.modifiedLines());
        upsertElements(userId, targetCanvasId, "image", request == null ? null : request.addedImages());
        upsertElements(userId, targetCanvasId, "image", request == null ? null : request.modifiedImages());
        upsertElements(userId, targetCanvasId, "textBox", request == null ? null : request.addedTextBoxes());
        upsertElements(userId, targetCanvasId, "textBox", request == null ? null : request.modifiedTextBoxes());
        jdbcTemplate.update("""
                UPDATE canvas_documents
                SET lines = '[]'::jsonb,
                    images = '[]'::jsonb,
                    text_boxes = '[]'::jsonb,
                    revision = revision + 1,
                    updated_at = NOW()
                WHERE id = ? AND user_id = ?
                """, targetCanvasId, userId);
        return new CanvasElementsResponse(emptyArray(), emptyArray(), emptyArray());
    }

    public CanvasViewportResponse viewport(UUID userId, UUID canvasId) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        return jdbcTemplate.query("""
                SELECT canvas_id, offset_x, offset_y, scale, updated_at
                FROM canvas_viewports
                WHERE canvas_id = ? AND user_id = ?
                """, this::mapViewport, targetCanvasId, userId)
                .stream()
                .findFirst()
                .orElseGet(() -> new CanvasViewportResponse(targetCanvasId, 0, 0, 1, OffsetDateTime.now()));
    }

    public CanvasViewportResponse saveViewport(UUID userId, UUID canvasId, CanvasViewportRequest request) {
        requireOwnedCanvas(userId, canvasId);
        double scale = request == null || request.scale() <= 0 ? 1 : request.scale();
        double offsetX = request == null ? 0 : request.offsetX();
        double offsetY = request == null ? 0 : request.offsetY();
        return jdbcTemplate.query("""
                INSERT INTO canvas_viewports (canvas_id, user_id, offset_x, offset_y, scale)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (canvas_id, user_id)
                DO UPDATE SET offset_x = EXCLUDED.offset_x,
                              offset_y = EXCLUDED.offset_y,
                              scale = EXCLUDED.scale,
                              updated_at = NOW()
                RETURNING canvas_id, offset_x, offset_y, scale, updated_at
                """, this::mapViewport, canvasId, userId, offsetX, offsetY, scale)
                .get(0);
    }

    public CanvasAssetResponse uploadAsset(UUID userId, MultipartFile image, String assetUrlBase) {
        StoredCanvasAsset stored = assetStorage.upload(userId, image);
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO canvas_assets (id, user_id, object_key, content_type, byte_size)
                VALUES (?, ?, ?, ?, ?)
                """, assetId, userId, stored.objectKey(), stored.contentType(), stored.byteSize());
        String url = stored.publicUrl() == null || stored.publicUrl().isBlank()
                ? stripTrailingSlash(assetUrlBase) + "/" + assetId
                : stored.publicUrl();
        return new CanvasAssetResponse(assetId, stored.objectKey(), url, stored.contentType(), stored.byteSize());
    }

    public CanvasAssetContent readAsset(UUID assetId) {
        Map<String, Object> asset;
        try {
            asset = jdbcTemplate.queryForMap("""
                    SELECT object_key, content_type, byte_size
                    FROM canvas_assets
                    WHERE id = ?
                    """, assetId);
        } catch (EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.", exception);
        }
        ResponseBytes<GetObjectResponse> bytes = assetStorage.read(String.valueOf(asset.get("object_key")));
        return new CanvasAssetContent(
                String.valueOf(asset.get("content_type")),
                ((Number) asset.get("byte_size")).longValue(),
                bytes.asByteArray());
    }

    public List<CanvasSummaryResponse> listDocuments(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, created_at, updated_at
                FROM canvas_documents
                WHERE user_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """, this::mapSummary, userId);
    }

    public CanvasSummaryResponse createDocument(UUID userId, CanvasDocumentRequest request) {
        String title = normalizeTitle(request == null ? null : request.title());
        return jdbcTemplate.query("""
                INSERT INTO canvas_documents (id, user_id, title, lines, images, text_boxes)
                VALUES (?, ?, ?, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
                RETURNING id, title, created_at, updated_at
                """, this::mapSummary, UUID.randomUUID(), userId, title)
                .get(0);
    }

    public CanvasSummaryResponse updateDocument(UUID userId, UUID canvasId, CanvasDocumentUpdateRequest request) {
        String title = normalizeTitle(request == null ? null : request.title());
        return jdbcTemplate.query("""
                UPDATE canvas_documents
                SET title = ?, updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, title, created_at, updated_at
                """, this::mapSummary, title, canvasId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스를 찾을 수 없습니다."));
    }

    @Transactional
    public void deleteDocument(UUID userId, UUID canvasId) {
        elementCacheService.invalidate(userId, canvasId);
        List<String> objectKeys = jdbcTemplate.queryForList("""
                SELECT object_key
                FROM canvas_elements
                WHERE canvas_id = ? AND user_id = ? AND object_key IS NOT NULL
                """, String.class, canvasId, userId);
        int deleted = jdbcTemplate.update("DELETE FROM canvas_documents WHERE id = ? AND user_id = ?", canvasId, userId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스를 찾을 수 없습니다.");
        }
        deleteAfterCommit(objectKeys);
        jdbcTemplate.update("""
                UPDATE canvas_folders
                SET canvas_ids = array_remove(canvas_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE user_id = ?
                """, canvasId, userId);
    }

    public List<CanvasFolderResponse> listFolders(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, category, name, canvas_ids, created_at, updated_at
                FROM canvas_folders
                WHERE user_id = ?
                ORDER BY category ASC, name ASC, created_at DESC
                """, this::mapFolder, userId);
    }

    public CanvasFolderResponse createFolder(UUID userId, CanvasFolderRequest request) {
        List<UUID> ownedCanvasIds = filterOwnedCanvasIds(userId, request == null ? null : request.canvasIds());
        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO canvas_folders (id, user_id, category, name, canvas_ids)
                    VALUES (?, ?, ?, ?, ?)
                    RETURNING id, category, name, canvas_ids, created_at, updated_at
                    """);
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, userId);
            ps.setString(3, normalizeCategory(request == null ? null : request.category()));
            ps.setString(4, normalizeFolderName(request == null ? null : request.name()));
            ps.setArray(5, connection.createArrayOf("uuid", ownedCanvasIds.toArray(UUID[]::new)));
            return ps;
        }, this::mapFolder).get(0);
    }

    public CanvasFolderResponse updateFolder(UUID userId, UUID folderId, CanvasFolderUpdateRequest request) {
        CanvasFolderResponse current = getFolder(userId, folderId);
        String category = request == null || request.category() == null ? current.category() : normalizeCategory(request.category());
        String name = request == null || request.name() == null || request.name().isBlank() ? current.name() : request.name().trim();
        List<UUID> canvasIds = request == null || request.canvasIds() == null ? current.canvasIds() : filterOwnedCanvasIds(userId, request.canvasIds());

        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    UPDATE canvas_folders
                    SET category = ?, name = ?, canvas_ids = ?, updated_at = NOW()
                    WHERE id = ? AND user_id = ?
                    RETURNING id, category, name, canvas_ids, created_at, updated_at
                    """);
            ps.setString(1, category);
            ps.setString(2, name);
            ps.setArray(3, connection.createArrayOf("uuid", canvasIds.toArray(UUID[]::new)));
            ps.setObject(4, folderId);
            ps.setObject(5, userId);
            return ps;
        }, this::mapFolder)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스 폴더를 찾을 수 없습니다."));
    }

    public void deleteFolder(UUID userId, UUID folderId) {
        int deleted = jdbcTemplate.update("DELETE FROM canvas_folders WHERE id = ? AND user_id = ?", folderId, userId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스 폴더를 찾을 수 없습니다.");
        }
    }

    @Transactional
    public CanvasFolderResponse addDocumentToFolder(UUID userId, UUID folderId, UUID canvasId) {
        requireOwnedCanvas(userId, canvasId);
        getFolder(userId, folderId);

        jdbcTemplate.update("""
                UPDATE canvas_folders
                SET canvas_ids = array_remove(canvas_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE user_id = ?
                """, canvasId, userId);

        return jdbcTemplate.query("""
                UPDATE canvas_folders
                SET canvas_ids = array_append(canvas_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE id = ? AND user_id = ? AND NOT (CAST(? AS uuid) = ANY(canvas_ids))
                RETURNING id, category, name, canvas_ids, created_at, updated_at
                """, this::mapFolder, canvasId, folderId, userId, canvasId)
                .stream()
                .findFirst()
                .orElseGet(() -> getFolder(userId, folderId));
    }

    public CanvasFolderResponse removeDocumentFromFolder(UUID userId, UUID folderId, UUID canvasId) {
        getFolder(userId, folderId);
        return jdbcTemplate.query("""
                UPDATE canvas_folders
                SET canvas_ids = array_remove(canvas_ids, CAST(? AS uuid)), updated_at = NOW()
                WHERE id = ? AND user_id = ?
                RETURNING id, category, name, canvas_ids, created_at, updated_at
                """, this::mapFolder, canvasId, folderId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스 폴더를 찾을 수 없습니다."));
    }

    private CanvasSummaryResponse getOrCreateDefaultDocument(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, title, created_at, updated_at
                FROM canvas_documents
                WHERE user_id = ?
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """, this::mapSummary, userId)
                .stream()
                .findFirst()
                .orElseGet(() -> createDocument(userId, new CanvasDocumentRequest("기본 캔버스")));
    }

    private CanvasResponse getCanvas(UUID userId, UUID canvasId) {
        CanvasResponse stored = getStoredCanvasJson(userId, canvasId);
        CanvasElementArrays elementArrays = readElementArrays(userId, canvasId);
        if (!elementArrays.hasRows()) {
            return stored;
        }
        return new CanvasResponse(stored.id(), stored.title(), elementArrays.lines(), elementArrays.images(), elementArrays.textBoxes());
    }

    private long getCanvasRevision(UUID userId, UUID canvasId) {
        return jdbcTemplate.queryForObject("""
                SELECT revision
                FROM canvas_documents
                WHERE id = ? AND user_id = ?
                """, Long.class, canvasId, userId);
    }

    private CanvasElementArrays readElementSnapshot(UUID userId, UUID canvasId) {
        String objectKey = jdbcTemplate.queryForObject("""
                SELECT COALESCE(elements_object_key, '')
                FROM canvas_documents
                WHERE id = ? AND user_id = ?
                """, String.class, canvasId, userId);
        if (objectKey == null || objectKey.isBlank()) {
            return new CanvasElementArrays(emptyArray(), emptyArray(), emptyArray(), false);
        }
        try {
            JsonNode snapshot = readJson(assetStorage.readJson(objectKey));
            JsonNode lines = snapshot.path("lines");
            JsonNode images = snapshot.path("images");
            JsonNode textBoxes = snapshot.path("textBoxes");
            return new CanvasElementArrays(
                    lines.isArray() ? (ArrayNode) lines : emptyArray(),
                    images.isArray() ? (ArrayNode) images : emptyArray(),
                    textBoxes.isArray() ? (ArrayNode) textBoxes : emptyArray(),
                    true);
        } catch (RuntimeException exception) {
            jdbcTemplate.update("""
                    UPDATE canvas_documents
                    SET elements_object_key = NULL,
                        elements_byte_size = NULL,
                        elements_public_url = NULL
                    WHERE id = ? AND user_id = ?
                    """, canvasId, userId);
            return new CanvasElementArrays(emptyArray(), emptyArray(), emptyArray(), false);
        }
    }

    private void writeElementSnapshot(UUID userId, UUID canvasId, CanvasElementArrays arrays) {
        ObjectNode snapshot = objectMapper.createObjectNode();
        snapshot.set("lines", arrays.lines());
        snapshot.set("images", arrays.images());
        snapshot.set("textBoxes", arrays.textBoxes());
        String objectKey = "canvas-snapshots/%s/elements.json".formatted(canvasId);
        StoredCanvasAsset stored = assetStorage.putJson(objectKey, snapshot.toString());
        jdbcTemplate.update("""
                UPDATE canvas_documents
                SET elements_object_key = ?,
                    elements_byte_size = ?,
                    elements_public_url = ?
                WHERE id = ? AND user_id = ?
                """, objectKey, stored.byteSize(), stored.publicUrl(), canvasId, userId);
    }

    private CanvasResponse getStoredCanvasJson(UUID userId, UUID canvasId) {
        return jdbcTemplate.query("""
                SELECT id, title, lines::text AS lines, images::text AS images, text_boxes::text AS text_boxes
                FROM canvas_documents
                WHERE id = ? AND user_id = ?
                """, this::mapCanvas, canvasId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스를 찾을 수 없습니다."));
    }

    private CanvasFolderResponse getFolder(UUID userId, UUID folderId) {
        return jdbcTemplate.query("""
                SELECT id, category, name, canvas_ids, created_at, updated_at
                FROM canvas_folders
                WHERE id = ? AND user_id = ?
                """, this::mapFolder, folderId, userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스 폴더를 찾을 수 없습니다."));
    }

    private void requireOwnedCanvas(UUID userId, UUID canvasId) {
        Boolean exists = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM canvas_documents WHERE id = ? AND user_id = ?
                )
                """, Boolean.class, canvasId, userId);
        if (!Boolean.TRUE.equals(exists)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "캔버스를 찾을 수 없습니다.");
        }
    }

    private void syncElements(UUID userId, UUID canvasId, JsonNode lines, JsonNode images, JsonNode textBoxes) {
        replaceElements(userId, canvasId, "line", lines);
        replaceElements(userId, canvasId, "image", images);
        replaceElements(userId, canvasId, "textBox", textBoxes);
        invalidateElementSnapshot(userId, canvasId);
    }

    private void invalidateElementSnapshot(UUID userId, UUID canvasId) {
        elementCacheService.invalidate(userId, canvasId);
        List<String> snapshotKeys = jdbcTemplate.queryForList("""
                UPDATE canvas_documents
                SET elements_object_key = NULL,
                    elements_byte_size = NULL,
                    elements_public_url = NULL
                WHERE id = ? AND user_id = ? AND elements_object_key IS NOT NULL
                RETURNING elements_object_key
                """, String.class, canvasId, userId);
        deleteAfterCommit(snapshotKeys);
    }

    private void deleteElements(UUID userId, UUID canvasId, String type, JsonNode elements) {
        Set<String> ids = elementIds(elements);
        if (ids.isEmpty()) {
            return;
        }
        List<String> objectKeys = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    SELECT object_key
                    FROM canvas_elements
                    WHERE canvas_id = ? AND user_id = ? AND type = ? AND id = ANY(?)
                    """);
            ps.setObject(1, canvasId);
            ps.setObject(2, userId);
            ps.setString(3, type);
            ps.setArray(4, connection.createArrayOf("text", ids.toArray(String[]::new)));
            return ps;
        }, (rs, rowNum) -> rs.getString("object_key"));
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    DELETE FROM canvas_elements
                    WHERE canvas_id = ? AND user_id = ? AND type = ? AND id = ANY(?)
                    """);
            ps.setObject(1, canvasId);
            ps.setObject(2, userId);
            ps.setString(3, type);
            ps.setArray(4, connection.createArrayOf("text", ids.toArray(String[]::new)));
            return ps;
        });
        deleteAfterCommit(objectKeys);
    }

    private void upsertElements(UUID userId, UUID canvasId, String type, JsonNode elements) {
        currentArray(elements).forEach(element -> upsertElement(userId, canvasId, type, element));
    }

    private void upsertElement(UUID userId, UUID canvasId, String type, JsonNode element) {
        JsonNode id = element.get("id");
        if (id == null || !id.isTextual()) {
            return;
        }
        String objectKey = "canvas-elements/%s/%s/%s.json".formatted(canvasId, type, id.asText());
        StoredCanvasAsset stored = assetStorage.putJson(objectKey, element.toString());
        Bounds bounds = boundsFor(type, element);
        ObjectNode metadataPayload = objectMapper.createObjectNode();
        metadataPayload.put("id", id.asText());
        metadataPayload.put("objectKey", objectKey);
        metadataPayload.put("url", stored.publicUrl());
        jdbcTemplate.update("""
                INSERT INTO canvas_elements (
                    id, canvas_id, user_id, type, payload, object_key, byte_size, public_url,
                    bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y
                )
                VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (canvas_id, id)
                DO UPDATE SET type = EXCLUDED.type,
                              payload = EXCLUDED.payload,
                              object_key = EXCLUDED.object_key,
                              byte_size = EXCLUDED.byte_size,
                              public_url = EXCLUDED.public_url,
                              bbox_min_x = EXCLUDED.bbox_min_x,
                              bbox_min_y = EXCLUDED.bbox_min_y,
                              bbox_max_x = EXCLUDED.bbox_max_x,
                              bbox_max_y = EXCLUDED.bbox_max_y,
                              revision = canvas_elements.revision + 1,
                              updated_at = NOW()
                """,
                id.asText(), canvasId, userId, type, metadataPayload.toString(), objectKey, stored.byteSize(), stored.publicUrl(),
                bounds.minX(), bounds.minY(), bounds.maxX(), bounds.maxY());
    }

    private void replaceElements(UUID userId, UUID canvasId, String type, JsonNode elements) {
        Set<String> nextIds = elementIds(elements);
        List<Map<String, Object>> removedRows = jdbcTemplate.queryForList("""
                SELECT id, object_key
                FROM canvas_elements
                WHERE canvas_id = ? AND user_id = ? AND type = ? AND object_key IS NOT NULL
                """, canvasId, userId, type);
        jdbcTemplate.update("DELETE FROM canvas_elements WHERE canvas_id = ? AND user_id = ? AND type = ?", canvasId, userId, type);
        currentArray(elements).forEach(element -> {
            JsonNode id = element.get("id");
            if (id == null || !id.isTextual()) {
                return;
            }
            String objectKey = "canvas-elements/%s/%s/%s.json".formatted(canvasId, type, id.asText());
            StoredCanvasAsset stored = assetStorage.putJson(objectKey, element.toString());
            Bounds bounds = boundsFor(type, element);
            ObjectNode metadataPayload = objectMapper.createObjectNode();
            metadataPayload.put("id", id.asText());
            metadataPayload.put("objectKey", objectKey);
            metadataPayload.put("url", stored.publicUrl());
            jdbcTemplate.update("""
                    INSERT INTO canvas_elements (
                        id, canvas_id, user_id, type, payload, object_key, byte_size, public_url,
                        bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y
                    )
                    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (canvas_id, id)
                    DO UPDATE SET type = EXCLUDED.type,
                                  payload = EXCLUDED.payload,
                                  object_key = EXCLUDED.object_key,
                                  byte_size = EXCLUDED.byte_size,
                                  public_url = EXCLUDED.public_url,
                                  bbox_min_x = EXCLUDED.bbox_min_x,
                                  bbox_min_y = EXCLUDED.bbox_min_y,
                                  bbox_max_x = EXCLUDED.bbox_max_x,
                                  bbox_max_y = EXCLUDED.bbox_max_y,
                                  revision = canvas_elements.revision + 1,
                                  updated_at = NOW()
                    """,
                    id.asText(), canvasId, userId, type, metadataPayload.toString(), objectKey, stored.byteSize(), stored.publicUrl(),
                    bounds.minX(), bounds.minY(), bounds.maxX(), bounds.maxY());
        });
        List<String> removedObjectKeys = removedRows.stream()
                .filter(row -> !nextIds.contains(String.valueOf(row.get("id"))))
                .map(row -> row.get("object_key"))
                .filter(value -> value != null && !String.valueOf(value).isBlank())
                .map(String::valueOf)
                .toList();
        deleteAfterCommit(removedObjectKeys);
    }

    private Set<String> elementIds(JsonNode elements) {
        Set<String> ids = new HashSet<>();
        currentArray(elements).forEach(element -> {
            JsonNode id = element.get("id");
            if (id != null && id.isTextual()) {
                ids.add(id.asText());
            }
        });
        return ids;
    }

    private void deleteAfterCommit(List<String> objectKeys) {
        List<String> keys = objectKeys.stream()
                .filter(key -> key != null && !key.isBlank())
                .distinct()
                .toList();
        if (keys.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            keys.forEach(assetStorage::delete);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                keys.forEach(assetStorage::delete);
            }
        });
    }

    private Bounds boundsFor(String type, JsonNode element) {
        if ("line".equals(type)) {
            JsonNode points = element.get("points");
            if (points != null && points.isArray() && !points.isEmpty()) {
                double minX = Double.POSITIVE_INFINITY;
                double minY = Double.POSITIVE_INFINITY;
                double maxX = Double.NEGATIVE_INFINITY;
                double maxY = Double.NEGATIVE_INFINITY;
                for (JsonNode point : points) {
                    double x = point.path("x").asDouble(0);
                    double y = point.path("y").asDouble(0);
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
                return new Bounds(minX, minY, maxX, maxY);
            }
        }
        double x = element.path("x").asDouble(0);
        double y = element.path("y").asDouble(0);
        double width = Math.max(0, element.path("width").asDouble(0));
        double height = Math.max(0, element.path("height").asDouble(0));
        return new Bounds(x, y, x + width, y + height);
    }

    private List<UUID> filterOwnedCanvasIds(UUID userId, List<UUID> canvasIds) {
        if (canvasIds == null || canvasIds.isEmpty()) {
            return List.of();
        }

        return jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    SELECT id
                    FROM canvas_documents
                    WHERE user_id = ? AND id = ANY(?)
                    ORDER BY updated_at DESC
                    """);
            ps.setObject(1, userId);
            ps.setArray(2, connection.createArrayOf("uuid", canvasIds.toArray(UUID[]::new)));
            return ps;
        }, (rs, rowNum) -> rs.getObject("id", UUID.class));
    }

    private JsonNode merge(JsonNode current, JsonNode added, JsonNode modified, JsonNode deleted) {
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        currentArray(current).forEach(item -> {
            JsonNode id = item.get("id");
            if (id != null && id.isTextual()) {
                byId.put(id.asText(), item);
            }
        });

        currentArray(deleted).forEach(item -> {
            JsonNode id = item.get("id");
            if (id != null && id.isTextual()) {
                byId.remove(id.asText());
            }
        });

        currentArray(modified).forEach(item -> putById(byId, item));
        currentArray(added).forEach(item -> putById(byId, item));

        ArrayNode merged = objectMapper.createArrayNode();
        byId.values().forEach(merged::add);
        return merged;
    }

    private void putById(Map<String, JsonNode> byId, JsonNode item) {
        JsonNode id = item.get("id");
        if (id != null && id.isTextual()) {
            byId.put(id.asText(), item);
        }
    }

    private Iterable<JsonNode> currentArray(JsonNode node) {
        return node != null && node.isArray() ? node : emptyArray();
    }

    private ArrayNode emptyArray() {
        return objectMapper.createArrayNode();
    }

    private CanvasResponse mapCanvas(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                readJson(rs.getString("lines")),
                readJson(rs.getString("images")),
                readJson(rs.getString("text_boxes")));
    }

    private CanvasSummaryResponse mapSummary(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasSummaryResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private CanvasMetadataResponse mapMetadata(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasMetadataResponse(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getLong("revision"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private CanvasViewportResponse mapViewport(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasViewportResponse(
                rs.getObject("canvas_id", UUID.class),
                rs.getDouble("offset_x"),
                rs.getDouble("offset_y"),
                rs.getDouble("scale"),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private CanvasFolderResponse mapFolder(ResultSet rs, int rowNum) throws SQLException {
        return new CanvasFolderResponse(
                rs.getObject("id", UUID.class),
                rs.getString("category"),
                rs.getString("name"),
                readUuidArray(rs.getArray("canvas_ids")),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private List<UUID> readUuidArray(Array array) throws SQLException {
        if (array == null) {
            return List.of();
        }
        Object value = array.getArray();
        if (value instanceof UUID[] uuidArray) {
            return Arrays.asList(uuidArray);
        }
        if (value instanceof Object[] objectArray) {
            return Arrays.stream(objectArray)
                    .map(item -> item instanceof UUID uuid ? uuid : UUID.fromString(item.toString()))
                    .toList();
        }
        return List.of();
    }

    private JsonNode readJson(String value) {
        try {
            return value == null ? emptyArray() : objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException("캔버스 데이터를 JSON으로 읽을 수 없습니다.", exception);
        }
    }

    private String normalizeTitle(String title) {
        return title == null || title.isBlank() ? "새 캔버스" : title.trim();
    }

    private String normalizeFolderName(String name) {
        return name == null || name.isBlank() ? "새 폴더" : name.trim();
    }

    private String normalizeCategory(String category) {
        return category == null ? "" : category.trim();
    }

    private String stripTrailingSlash(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    public record CanvasAssetContent(String contentType, long byteSize, byte[] bytes) {
    }

    private record CanvasElementArrays(ArrayNode lines, ArrayNode images, ArrayNode textBoxes, boolean hasRows) {
    }

    private record CanvasElementPayload(String type, JsonNode payload) {
    }

    private record Bounds(double minX, double minY, double maxX, double maxY) {
    }
}
