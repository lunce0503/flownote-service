package com.flownote.canvas;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class CanvasDtos {
    private CanvasDtos() {
    }

    public record CanvasSaveRequest(
            @JsonProperty("mutationId")
            UUID mutationId,
            @JsonProperty("addedLines")
            JsonNode addedLines,
            @JsonProperty("modifiedLines")
            JsonNode modifiedLines,
            @JsonProperty("deletedLines")
            JsonNode deletedLines,
            @JsonProperty("addedImages")
            JsonNode addedImages,
            @JsonProperty("modifiedImages")
            JsonNode modifiedImages,
            @JsonProperty("deletedImages")
            JsonNode deletedImages,
            @JsonProperty("addedTextBoxes")
            JsonNode addedTextBoxes,
            @JsonProperty("modifiedTextBoxes")
            JsonNode modifiedTextBoxes,
            @JsonProperty("deletedTextBoxes")
            JsonNode deletedTextBoxes,
            String trigger,
            @JsonProperty("operationId")
            UUID operationId,
            @JsonProperty("clientCreatedAt")
            OffsetDateTime clientCreatedAt
    ) {
        public CanvasSaveRequest(UUID mutationId, JsonNode addedLines, JsonNode modifiedLines, JsonNode deletedLines,
                JsonNode addedImages, JsonNode modifiedImages, JsonNode deletedImages, JsonNode addedTextBoxes,
                JsonNode modifiedTextBoxes, JsonNode deletedTextBoxes) {
            this(mutationId, addedLines, modifiedLines, deletedLines, addedImages, modifiedImages, deletedImages,
                    addedTextBoxes, modifiedTextBoxes, deletedTextBoxes, null, null, null);
        }
    }

    public record CanvasSaveResponse(
            @JsonProperty("mutationId")
            UUID mutationId,
            long revision,
            boolean duplicate,
            @JsonProperty("storageStatus")
            String storageStatus
    ) {
        public CanvasSaveResponse(UUID mutationId, long revision, boolean duplicate) {
            this(mutationId, revision, duplicate, "PENDING");
        }
    }

    public record CanvasResponse(
            UUID id,
            String title,
            JsonNode lines,
            JsonNode images,
            @JsonProperty("textBoxes")
            JsonNode textBoxes
    ) {
    }

    public record CanvasMetadataResponse(
            UUID id,
            String title,
            long revision,
            @JsonProperty("created_at")
            OffsetDateTime createdAt,
            @JsonProperty("updated_at")
            OffsetDateTime updatedAt
    ) {
    }

    public record CanvasElementsResponse(
            JsonNode lines,
            JsonNode images,
            @JsonProperty("textBoxes")
            JsonNode textBoxes,
            Long revision,
            String status,
            String source,
            @JsonProperty("failedElements")
            List<String> failedElements,
            List<String> warnings,
            Map<String, Long> timings
    ) {
        public CanvasElementsResponse(JsonNode lines, JsonNode images, JsonNode textBoxes) {
            this(lines, images, textBoxes, null, "COMPLETE", "DATABASE", List.of(), List.of(), Map.of());
        }
    }

    public record CanvasAssetResponse(
            UUID id,
            @JsonProperty("objectKey")
            String objectKey,
            String url,
            @JsonProperty("contentType")
            String contentType,
            @JsonProperty("byteSize")
            long byteSize
    ) {
    }

    public record CanvasViewportRequest(
            @JsonProperty("offsetX")
            double offsetX,
            @JsonProperty("offsetY")
            double offsetY,
            double scale
    ) {
    }

    public record CanvasViewportResponse(
            UUID canvasId,
            @JsonProperty("offsetX")
            double offsetX,
            @JsonProperty("offsetY")
            double offsetY,
            double scale,
            @JsonProperty("updated_at")
            OffsetDateTime updatedAt
    ) {
    }

    public record CanvasSummaryResponse(
            UUID id,
            String title,
            @JsonProperty("created_at")
            OffsetDateTime createdAt,
            @JsonProperty("updated_at")
            OffsetDateTime updatedAt
    ) {
    }

    public record CanvasDocumentRequest(
            String title
    ) {
    }

    public record CanvasDocumentUpdateRequest(
            String title
    ) {
    }

    public record CanvasFolderRequest(
            String category,
            String name,
            @JsonProperty("canvas_ids")
            List<UUID> canvasIds
    ) {
    }

    public record CanvasFolderUpdateRequest(
            String category,
            String name,
            @JsonProperty("canvas_ids")
            List<UUID> canvasIds
    ) {
    }

    public record CanvasFolderResponse(
            UUID id,
            String category,
            String name,
            @JsonProperty("canvasIds")
            List<UUID> canvasIds,
            @JsonProperty("created_at")
            OffsetDateTime createdAt,
            @JsonProperty("updated_at")
            OffsetDateTime updatedAt
    ) {
    }
}
