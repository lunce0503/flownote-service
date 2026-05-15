package com.flownote.canvas;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonProperty;

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
            JsonNode lines,
            JsonNode images,
            @JsonProperty("textBoxes")
            JsonNode textBoxes
    ) {
    }
}
