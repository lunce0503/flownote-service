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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import com.flownote.canvas.CanvasDtos.CanvasSaveResponse;
import com.flownote.canvas.CanvasDtos.CanvasSummaryResponse;
import com.flownote.canvas.CanvasDtos.CanvasViewportRequest;
import com.flownote.canvas.CanvasDtos.CanvasViewportResponse;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

@Service
public class CanvasService {
    private static final Logger log = LoggerFactory.getLogger(CanvasService.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final CanvasAssetStorage assetStorage;
    private final CanvasElementCacheService elementCacheService;
    private final CanvasStorageOutboxService storageOutboxService;

    public CanvasService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            CanvasAssetStorage assetStorage,
            CanvasElementCacheService elementCacheService,
            CanvasStorageOutboxService storageOutboxService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.assetStorage = assetStorage;
        this.elementCacheService = elementCacheService;
        this.storageOutboxService = storageOutboxService;
    }

    public CanvasResponse load(UUID userId, UUID canvasId) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        return getCanvas(userId, targetCanvasId);
    }

    @Transactional
    public CanvasResponse save(UUID userId, UUID canvasId, CanvasSaveRequest request) {
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        lockCanvasSave(userId, targetCanvasId);
        CanvasResponse current = getCanvas(userId, targetCanvasId);
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
        long startedAt = System.nanoTime();
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        long revision = getCanvasRevision(userId, targetCanvasId);
        Optional<CanvasElementsResponse> cached = elementCacheService.get(userId, targetCanvasId, revision);
        if (cached.isPresent()) {
            CanvasElementsResponse response = cached.get();
            log.info(
                    "canvas_elements_load_completed canvasId={} revision={} cacheHit=true elapsedMs={} lines={} images={} textBoxes={} bytes={}",
                    targetCanvasId,
                    revision,
                    elapsedMs(startedAt),
                    arraySize(response.lines()),
                    arraySize(response.images()),
                    arraySize(response.textBoxes()),
                    responseBytes(response));
            return response;
        }

        CanvasElementsResponse response;
        CanvasElementArrays elementArrays = readElementArrays(userId, targetCanvasId);
        if (elementArrays.hasRows()) {
            response = new CanvasElementsResponse(
                    elementArrays.lines(), elementArrays.images(), elementArrays.textBoxes(), revision,
                    elementArrays.complete() ? "COMPLETE" : "PARTIAL", "DATABASE", List.of(),
                    elementArrays.complete() ? List.of() : List.of("일부 이전 R2 요소를 불러오지 못했습니다."),
                    Map.of("totalMs", elapsedMs(startedAt)));
        } else {
            CanvasResponse canvas = getStoredCanvasJson(userId, targetCanvasId);
            response = new CanvasElementsResponse(canvas.lines(), canvas.images(), canvas.textBoxes(), revision,
                    "COMPLETE", "DATABASE", List.of(), List.of(), Map.of("totalMs", elapsedMs(startedAt)));
        }
        elementCacheService.put(userId, targetCanvasId, revision, response);
        log.info(
                "canvas_elements_load_completed canvasId={} revision={} cacheHit=false elapsedMs={} lines={} images={} textBoxes={} bytes={}",
                targetCanvasId,
                revision,
                elapsedMs(startedAt),
                arraySize(response.lines()),
                arraySize(response.images()),
                arraySize(response.textBoxes()),
                responseBytes(response));
        return response;
    }

    private CanvasElementArrays readElementArrays(UUID userId, UUID canvasId) {
        long startedAt = System.nanoTime();
        long queryStartedAt = System.nanoTime();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT id, canvas_id, user_id, type, payload::text AS payload, object_key, storage_status
                FROM canvas_elements
                WHERE canvas_id = ? AND user_id = ?
                ORDER BY created_at ASC
                """, canvasId, userId);
        long queryElapsedMs = elapsedMs(queryStartedAt);
        CanvasElementArrays arrays = buildElementArrays(rows);
        log.info(
                "canvas_elements_rows_loaded canvasId={} rows={} failedRows={} queryMs={} elapsedMs={} lines={} images={} textBoxes={} snapshotWritten={}",
                canvasId,
                rows.size(),
                arrays.failedRows(),
                queryElapsedMs,
                elapsedMs(startedAt),
                arraySize(arrays.lines()),
                arraySize(arrays.images()),
                arraySize(arrays.textBoxes()),
                false);
        return arrays;
    }

    private CanvasElementArrays buildElementArrays(List<Map<String, Object>> rows) {
        ArrayNode lines = emptyArray();
        ArrayNode images = emptyArray();
        ArrayNode textBoxes = emptyArray();
        if (rows.isEmpty()) {
            return new CanvasElementArrays(lines, images, textBoxes, false, true, 0);
        }

        ExecutorService executor = Executors.newFixedThreadPool(Math.min(24, Math.max(1, rows.size())));
        int failedRows;
        try {
            List<CompletableFuture<Optional<CanvasElementPayload>>> futures = rows.stream()
                    .map(row -> CompletableFuture.supplyAsync(() -> readElementPayloadSafely(row), executor))
                    .toList();
            List<Optional<CanvasElementPayload>> payloads = futures.stream()
                    .map(CompletableFuture::join)
                    .toList();
            failedRows = (int) payloads.stream().filter(Optional::isEmpty).count();
            payloads.stream().flatMap(Optional::stream).forEach(element -> {
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
        if (failedRows > 0) {
            log.warn("canvas_elements_partial_load rows={} failedRows={} lines={} images={} textBoxes={}",
                    rows.size(),
                    failedRows,
                    arraySize(lines),
                    arraySize(images),
                    arraySize(textBoxes));
        }
        return new CanvasElementArrays(lines, images, textBoxes, true, failedRows == 0, failedRows);
    }

    private Optional<CanvasElementPayload> readElementPayloadSafely(Map<String, Object> row) {
        try {
            return Optional.of(readElementPayload(row));
        } catch (RuntimeException exception) {
            log.warn(
                    "canvas_element_payload_read_failed type={} objectKey={} id={}",
                    row.get("type"),
                    row.get("object_key"),
                    row.get("id"),
                    exception);
            return Optional.empty();
        }
    }

    private CanvasElementPayload readElementPayload(Map<String, Object> row) {
        String objectKey = row.get("object_key") == null ? "" : String.valueOf(row.get("object_key"));
        JsonNode databasePayload = readJson(String.valueOf(row.get("payload")));
        boolean legacyMetadataOnly = databasePayload.size() <= 3
                && databasePayload.has("id")
                && databasePayload.has("objectKey");
        JsonNode payload = legacyMetadataOnly && !objectKey.isBlank()
                ? readJson(assetStorage.readJson(objectKey))
                : databasePayload;
        if (legacyMetadataOnly && !objectKey.isBlank()) {
            backfillLegacyElementPayload(row, payload);
        }
        return new CanvasElementPayload(String.valueOf(row.get("type")), payload);
    }

    private void backfillLegacyElementPayload(Map<String, Object> row, JsonNode payload) {
        try {
            jdbcTemplate.update("""
                    UPDATE canvas_elements
                    SET payload = ?::jsonb,
                        storage_status = CASE WHEN storage_status = 'FAILED' THEN 'READY' ELSE storage_status END,
                        storage_error_code = NULL,
                        updated_at = NOW()
                    WHERE canvas_id = ? AND user_id = ? AND id = ? AND object_key = ?
                      AND payload ->> 'objectKey' IS NOT NULL
                    """,
                    payload.toString(),
                    row.get("canvas_id"),
                    row.get("user_id"),
                    row.get("id"),
                    row.get("object_key"));
        } catch (RuntimeException exception) {
            log.warn("canvas_legacy_payload_backfill_failed canvasId={} elementId={} objectKey={}",
                    row.get("canvas_id"),
                    row.get("id"),
                    row.get("object_key"),
                    exception);
        }
    }

    @Transactional
    public CanvasSaveResponse saveElements(UUID userId, UUID canvasId, CanvasSaveRequest request) {
        long startedAt = System.nanoTime();
        UUID targetCanvasId = canvasId == null ? getOrCreateDefaultDocument(userId).id() : canvasId;
        requireOwnedCanvas(userId, targetCanvasId);
        UUID mutationId = requireMutationId(request);
        String payloadHash = CanvasMutationHasher.hash(objectMapper, request);
        lockCanvasSave(userId, targetCanvasId);

        Optional<CanvasMutationRecord> existingMutation = findCanvasMutation(userId, targetCanvasId, mutationId);
        if (existingMutation.isPresent()) {
            CanvasMutationRecord mutation = existingMutation.get();
            if (!mutation.payloadHash().equals(payloadHash)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "동일한 mutationId에 다른 저장 내용이 전달되었습니다.");
            }
            if (!"COMPLETED".equals(mutation.status()) || mutation.resultRevision() == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "동일한 저장 요청이 아직 처리 중입니다.");
            }
            log.info(
                    "canvas_elements_save_duplicate canvasId={} mutationId={} revision={} elapsedMs={}",
                    targetCanvasId,
                    mutationId,
                    mutation.resultRevision(),
                    elapsedMs(startedAt));
            return new CanvasSaveResponse(mutationId, mutation.resultRevision(), true, storageStatus(targetCanvasId));
        }

        insertCanvasMutation(userId, targetCanvasId, mutationId, payloadHash);
        if (!hasSaveChanges(request)) {
            long revision = getCanvasRevision(userId, targetCanvasId);
            completeCanvasMutation(userId, targetCanvasId, mutationId, revision);
            log.info("canvas_elements_save_skipped canvasId={} mutationId={} reason=no_changes elapsedMs={}", targetCanvasId, mutationId, elapsedMs(startedAt));
            return new CanvasSaveResponse(mutationId, revision, false, storageStatus(targetCanvasId));
        }
        log.info(
                "canvas_elements_save_started canvasId={} mutationId={} addedLines={} modifiedLines={} deletedLines={} addedImages={} modifiedImages={} deletedImages={} addedTextBoxes={} modifiedTextBoxes={} deletedTextBoxes={}",
                targetCanvasId,
                mutationId,
                arraySize(request.addedLines()),
                arraySize(request.modifiedLines()),
                arraySize(request.deletedLines()),
                arraySize(request.addedImages()),
                arraySize(request.modifiedImages()),
                arraySize(request.deletedImages()),
                arraySize(request.addedTextBoxes()),
                arraySize(request.modifiedTextBoxes()),
                arraySize(request.deletedTextBoxes()));
        invalidateElementSnapshot(userId, targetCanvasId);
        int storagePriority = CanvasOperationPriority.resolve("SAVE", request.trigger());
        deleteElements(userId, targetCanvasId, "line", request.deletedLines());
        deleteElements(userId, targetCanvasId, "image", request.deletedImages());
        deleteElements(userId, targetCanvasId, "textBox", request.deletedTextBoxes());
        upsertElements(userId, targetCanvasId, "line", request.addedLines(), storagePriority);
        upsertElements(userId, targetCanvasId, "line", request.modifiedLines(), storagePriority);
        upsertElements(userId, targetCanvasId, "image", request.addedImages(), storagePriority);
        upsertElements(userId, targetCanvasId, "image", request.modifiedImages(), storagePriority);
        upsertElements(userId, targetCanvasId, "textBox", request.addedTextBoxes(), storagePriority);
        upsertElements(userId, targetCanvasId, "textBox", request.modifiedTextBoxes(), storagePriority);
        jdbcTemplate.update("""
                UPDATE canvas_documents
                SET lines = '[]'::jsonb,
                    images = '[]'::jsonb,
                    text_boxes = '[]'::jsonb,
                    revision = revision + 1,
                    updated_at = NOW()
                WHERE id = ? AND user_id = ?
                """, targetCanvasId, userId);
        scheduleElementWarmupAfterCommit(userId, targetCanvasId);
        long revision = getCanvasRevision(userId, targetCanvasId);
        completeCanvasMutation(userId, targetCanvasId, mutationId, revision);
        log.info("canvas_elements_save_completed canvasId={} mutationId={} revision={} elapsedMs={}", targetCanvasId, mutationId, revision, elapsedMs(startedAt));
        return new CanvasSaveResponse(mutationId, revision, false, "PENDING");
    }

    private UUID requireMutationId(CanvasSaveRequest request) {
        if (request == null || request.mutationId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "mutationId가 필요합니다.");
        }
        return request.mutationId();
    }

    private Optional<CanvasMutationRecord> findCanvasMutation(UUID userId, UUID canvasId, UUID mutationId) {
        return jdbcTemplate.query("""
                SELECT payload_hash, status, result_revision
                FROM canvas_mutations
                WHERE canvas_id = ? AND mutation_id = ? AND user_id = ?
                """, (rs, rowNum) -> new CanvasMutationRecord(
                rs.getString("payload_hash"),
                rs.getString("status"),
                rs.getObject("result_revision", Long.class)), canvasId, mutationId, userId)
                .stream()
                .findFirst();
    }

    private void insertCanvasMutation(UUID userId, UUID canvasId, UUID mutationId, String payloadHash) {
        jdbcTemplate.update("""
                INSERT INTO canvas_mutations (canvas_id, mutation_id, user_id, payload_hash, status)
                VALUES (?, ?, ?, ?, 'PROCESSING')
                """, canvasId, mutationId, userId, payloadHash);
    }

    private void completeCanvasMutation(UUID userId, UUID canvasId, UUID mutationId, long revision) {
        jdbcTemplate.update("""
                UPDATE canvas_mutations
                SET status = 'COMPLETED', result_revision = ?, completed_at = NOW()
                WHERE canvas_id = ? AND mutation_id = ? AND user_id = ?
                """, revision, canvasId, mutationId, userId);
    }

    private void lockCanvasSave(UUID userId, UUID canvasId) {
        jdbcTemplate.query("""
                SELECT pg_advisory_xact_lock(
                    hashtext(?::text),
                    hashtext(?::text)
                )
                """, rs -> {
                }, userId.toString(), canvasId.toString());
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
        String url = assetUrlBase == null || assetUrlBase.isBlank()
                ? stored.publicUrl()
                : stripTrailingSlash(assetUrlBase) + "/" + assetId;
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

    public CanvasAssetContent readAssetByObjectKey(String objectKey) {
        String normalizedObjectKey = normalizeImageObjectKey(objectKey);
        ResponseBytes<GetObjectResponse> bytes = assetStorage.read(normalizedObjectKey);
        String contentType = bytes.response().contentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 파일만 읽을 수 있습니다.");
        }
        long byteSize = bytes.response().contentLength();
        return new CanvasAssetContent(
                contentType,
                byteSize >= 0 ? byteSize : bytes.asByteArray().length,
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
            return new CanvasElementArrays(emptyArray(), emptyArray(), emptyArray(), false, true, 0);
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
                    true,
                    true,
                    0);
        } catch (RuntimeException exception) {
            jdbcTemplate.update("""
                    UPDATE canvas_documents
                    SET elements_object_key = NULL,
                        elements_byte_size = NULL,
                        elements_public_url = NULL
                    WHERE id = ? AND user_id = ?
                    """, canvasId, userId);
            return new CanvasElementArrays(emptyArray(), emptyArray(), emptyArray(), false, true, 0);
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
                SELECT elements_object_key
                FROM canvas_documents
                WHERE id = ? AND user_id = ? AND elements_object_key IS NOT NULL
                """, String.class, canvasId, userId);
        jdbcTemplate.update("""
                UPDATE canvas_documents
                SET elements_object_key = NULL, elements_byte_size = NULL, elements_public_url = NULL
                WHERE id = ? AND user_id = ?
                """, canvasId, userId);
        snapshotKeys.forEach(objectKey -> storageOutboxService.enqueueDelete(userId, canvasId, objectKey));
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
        objectKeys.forEach(objectKey -> storageOutboxService.enqueueDelete(userId, canvasId, objectKey));
    }

    private void upsertElements(UUID userId, UUID canvasId, String type, JsonNode elements, int priority) {
        currentArray(elements).forEach(element -> upsertElement(userId, canvasId, type, element, priority));
    }

    private void upsertElement(UUID userId, UUID canvasId, String type, JsonNode element, int priority) {
        JsonNode id = element.get("id");
        if (id == null || !id.isTextual()) {
            return;
        }
        String elementId = id.asText();
        String previousObjectKey = findElementObjectKey(userId, canvasId, elementId);
        String objectKey = "canvas-elements/%s/%s/%s-%s.json".formatted(canvasId, type, elementId, UUID.randomUUID());
        Bounds bounds = boundsFor(type, element);
        jdbcTemplate.update("""
                INSERT INTO canvas_elements (
                    id, canvas_id, user_id, type, payload, object_key, byte_size, public_url,
                    bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y, storage_status,
                    storage_error_code, r2_synced_at
                )
                VALUES (?, ?, ?, ?, ?::jsonb, ?, NULL, NULL, ?, ?, ?, ?, 'PENDING', NULL, NULL)
                ON CONFLICT (canvas_id, id)
                DO UPDATE SET type = EXCLUDED.type,
                              payload = EXCLUDED.payload,
                              object_key = EXCLUDED.object_key,
                              byte_size = NULL,
                              public_url = NULL,
                              bbox_min_x = EXCLUDED.bbox_min_x,
                              bbox_min_y = EXCLUDED.bbox_min_y,
                              bbox_max_x = EXCLUDED.bbox_max_x,
                              bbox_max_y = EXCLUDED.bbox_max_y,
                              storage_status = 'PENDING',
                              storage_error_code = NULL,
                              r2_synced_at = NULL,
                              revision = canvas_elements.revision + 1,
                              updated_at = NOW()
                """,
                elementId, canvasId, userId, type, element.toString(), objectKey,
                bounds.minX(), bounds.minY(), bounds.maxX(), bounds.maxY());
        storageOutboxService.enqueueElementUpload(
                userId, canvasId, elementId, objectKey, element, priority);
        if (previousObjectKey != null && !previousObjectKey.isBlank() && !previousObjectKey.equals(objectKey)) {
            storageOutboxService.enqueueDelete(userId, canvasId, previousObjectKey);
        }
    }

    private void replaceElements(UUID userId, UUID canvasId, String type, JsonNode elements) {
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
            String objectKey = "canvas-elements/%s/%s/%s-%s.json".formatted(canvasId, type, id.asText(), UUID.randomUUID());
            Bounds bounds = boundsFor(type, element);
            jdbcTemplate.update("""
                    INSERT INTO canvas_elements (
                        id, canvas_id, user_id, type, payload, object_key, byte_size, public_url,
                        bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y, storage_status,
                        storage_error_code, r2_synced_at
                    )
                    VALUES (?, ?, ?, ?, ?::jsonb, ?, NULL, NULL, ?, ?, ?, ?, 'PENDING', NULL, NULL)
                    ON CONFLICT (canvas_id, id)
                    DO UPDATE SET type = EXCLUDED.type,
                                  payload = EXCLUDED.payload,
                                  object_key = EXCLUDED.object_key,
                                  byte_size = NULL,
                                  public_url = NULL,
                                  bbox_min_x = EXCLUDED.bbox_min_x,
                                  bbox_min_y = EXCLUDED.bbox_min_y,
                                  bbox_max_x = EXCLUDED.bbox_max_x,
                                  bbox_max_y = EXCLUDED.bbox_max_y,
                                  storage_status = 'PENDING',
                                  storage_error_code = NULL,
                                  r2_synced_at = NULL,
                                  revision = canvas_elements.revision + 1,
                                  updated_at = NOW()
                    """,
                    id.asText(), canvasId, userId, type, element.toString(), objectKey,
                    bounds.minX(), bounds.minY(), bounds.maxX(), bounds.maxY());
            storageOutboxService.enqueueElementUpload(
                    userId, canvasId, id.asText(), objectKey, element,
                    CanvasOperationPriority.resolve("SAVE", "AUTOMATIC"));
        });
        List<String> removedObjectKeys = removedRows.stream()
                .map(row -> row.get("object_key"))
                .filter(value -> value != null && !String.valueOf(value).isBlank())
                .map(String::valueOf)
                .toList();
        removedObjectKeys.forEach(objectKey -> storageOutboxService.enqueueDelete(userId, canvasId, objectKey));
    }

    private String storageStatus(UUID canvasId) {
        Integer pending = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM canvas_storage_jobs
                WHERE canvas_id = ? AND status IN ('PENDING', 'PROCESSING')
                """, Integer.class, canvasId);
        return pending != null && pending > 0 ? "PENDING" : "READY";
    }

    private String findElementObjectKey(UUID userId, UUID canvasId, String elementId) {
        return jdbcTemplate.query("""
                SELECT object_key
                FROM canvas_elements
                WHERE canvas_id = ? AND user_id = ? AND id = ?
                """, (rs, rowNum) -> rs.getString("object_key"), canvasId, userId, elementId)
                .stream()
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
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

    private boolean hasSaveChanges(CanvasSaveRequest request) {
        if (request == null) {
            return false;
        }
        return hasArrayItems(request.addedLines())
                || hasArrayItems(request.modifiedLines())
                || hasArrayItems(request.deletedLines())
                || hasArrayItems(request.addedImages())
                || hasArrayItems(request.modifiedImages())
                || hasArrayItems(request.deletedImages())
                || hasArrayItems(request.addedTextBoxes())
                || hasArrayItems(request.modifiedTextBoxes())
                || hasArrayItems(request.deletedTextBoxes());
    }

    private boolean hasArrayItems(JsonNode node) {
        return node != null && node.isArray() && !node.isEmpty();
    }

    private int arraySize(JsonNode node) {
        return node != null && node.isArray() ? node.size() : 0;
    }

    private int responseBytes(CanvasElementsResponse response) {
        return jsonBytes(response.lines()) + jsonBytes(response.images()) + jsonBytes(response.textBoxes());
    }

    private int jsonBytes(JsonNode node) {
        return node == null ? 0 : node.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
    }

    private long elapsedMs(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }

    private void scheduleElementWarmupAfterCommit(UUID userId, UUID canvasId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            warmElementCacheAsync(userId, canvasId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                warmElementCacheAsync(userId, canvasId);
            }
        });
    }

    private void warmElementCacheAsync(UUID userId, UUID canvasId) {
        CompletableFuture.runAsync(() -> {
            long startedAt = System.nanoTime();
            try {
                CanvasElementsResponse response = elements(userId, canvasId);
                log.info(
                        "canvas_elements_warmup_completed canvasId={} elapsedMs={} lines={} images={} textBoxes={} bytes={}",
                        canvasId,
                        elapsedMs(startedAt),
                        arraySize(response.lines()),
                        arraySize(response.images()),
                        arraySize(response.textBoxes()),
                        responseBytes(response));
            } catch (RuntimeException exception) {
                log.warn("canvas_elements_warmup_failed canvasId={} elapsedMs={}", canvasId, elapsedMs(startedAt), exception);
            }
        });
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

    private String normalizeImageObjectKey(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 objectKey가 필요합니다.");
        }
        String normalizedObjectKey = objectKey.strip().replace('\\', '/');
        if (normalizedObjectKey.startsWith("/") || normalizedObjectKey.contains("..") || !normalizedObjectKey.startsWith("canvas/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 objectKey 형식이 올바르지 않습니다.");
        }
        return normalizedObjectKey;
    }

    public record CanvasAssetContent(String contentType, long byteSize, byte[] bytes) {
    }

    private record CanvasElementArrays(
            ArrayNode lines,
            ArrayNode images,
            ArrayNode textBoxes,
            boolean hasRows,
            boolean complete,
            int failedRows) {
    }

    private record CanvasElementPayload(String type, JsonNode payload) {
    }

    private record CanvasMutationRecord(String payloadHash, String status, Long resultRevision) {
    }

    private record Bounds(double minX, double minY, double maxX, double maxY) {
    }
}
