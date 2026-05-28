package com.flownote.canvas;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class CanvasDtos {
    private CanvasDtos() {
    }

    public record CanvasSaveRequest(
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
            JsonNode deletedTextBoxes
    ) {
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
            JsonNode textBoxes
    ) {
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
