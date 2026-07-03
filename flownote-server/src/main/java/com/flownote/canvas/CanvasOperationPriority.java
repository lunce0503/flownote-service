package com.flownote.canvas;

import java.util.Locale;

public final class CanvasOperationPriority {
    private CanvasOperationPriority() {
    }

    public static int resolve(String operationType, String trigger) {
        String operation = normalize(operationType);
        String normalizedTrigger = normalize(trigger);
        if ("SAVE".equals(operation) && "MANUAL".equals(normalizedTrigger)) return 100;
        if ("LOAD".equals(operation) && "MANUAL".equals(normalizedTrigger)) return 90;
        return switch (normalizedTrigger) {
            case "SELECTION" -> 80;
            case "REMOTE" -> 70;
            case "AUTOMATIC", "AUTO" -> 50;
            case "RETRY" -> 40;
            case "MAINTENANCE" -> 10;
            default -> "SAVE".equals(operation) ? 60 : 55;
        };
    }

    public static String normalizeTrigger(String trigger) {
        String normalized = normalize(trigger);
        return normalized.isBlank() ? "AUTOMATIC" : normalized;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
