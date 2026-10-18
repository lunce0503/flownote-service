import { CANVAS_VIEWPORT_STORAGE_KEY, MAX_CANVAS_SCALE, MIN_CANVAS_SCALE, type StoredCanvasViewport } from "./canvasConstants";

const getCanvasViewportStorageKey = (canvasId: string) => `${CANVAS_VIEWPORT_STORAGE_KEY}.${canvasId}`;

export const parseStoredViewport = (raw: string | null): StoredCanvasViewport | null => {
    try {
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<StoredCanvasViewport>;
        if (typeof value.scale !== "number" || typeof value.offset?.x !== "number" || typeof value.offset?.y !== "number") {
            return null;
        }
        return {
            offset: { x: value.offset.x, y: value.offset.y },
            scale: Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, value.scale)),
        };
    } catch {
        return null;
    }
};

export const readStoredViewport = (canvasId: string): StoredCanvasViewport | null => (
    parseStoredViewport(localStorage.getItem(getCanvasViewportStorageKey(canvasId)))
);

export const writeStoredViewport = (canvasId: string, viewport: StoredCanvasViewport) => {
    localStorage.setItem(getCanvasViewportStorageKey(canvasId), JSON.stringify(viewport));
};
