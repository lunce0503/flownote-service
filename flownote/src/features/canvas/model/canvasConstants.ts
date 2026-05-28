import type { Point } from "../../../entities/canvas/model/types";

export const CANVAS_AUTOSAVE_DELAY_MS = 5000;
export const CANVAS_VIEWPORT_STORAGE_KEY = "flownote.canvas.viewport";
export const CANVAS_PEN_COLOR_STORAGE_KEY = "flownote.canvas.penColor";
export const CANVAS_LIBRARY_VISIBLE_STORAGE_KEY = "flownote.canvas.libraryVisible";
export const CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY = "flownote.canvas.pencilOnlyMode";
export const CANVAS_MANAGEMENT_TOOLBAR_STORAGE_KEY = "flownote.canvas.managementToolbarVisible";
export const CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY = "flownote.canvas.collapsedFolderIds";
export const DEFAULT_PEN_COLOR = "#000000";
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_TEXT_BOX_WIDTH = 180;
export const DEFAULT_TEXT_BOX_HEIGHT = 72;

export type StoredCanvasViewport = {
    offset: Point;
    scale: number;
};

export const DEFAULT_CANVAS_VIEWPORT: StoredCanvasViewport = {
    offset: { x: 0, y: 0 },
    scale: 1,
};
