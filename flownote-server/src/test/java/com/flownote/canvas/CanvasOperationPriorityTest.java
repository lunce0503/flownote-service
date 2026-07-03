package com.flownote.canvas;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CanvasOperationPriorityTest {
    @Test
    void manualSaveHasHighestPriority() {
        assertThat(CanvasOperationPriority.resolve("SAVE", "manual"))
                .isGreaterThan(CanvasOperationPriority.resolve("LOAD", "selection"));
        assertThat(CanvasOperationPriority.resolve("LOAD", "selection"))
                .isGreaterThan(CanvasOperationPriority.resolve("SAVE", "automatic"));
        assertThat(CanvasOperationPriority.resolve("SAVE", "retry"))
                .isGreaterThan(CanvasOperationPriority.resolve("SAVE", "maintenance"));
    }
}
