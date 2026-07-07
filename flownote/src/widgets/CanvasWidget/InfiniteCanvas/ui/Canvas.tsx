import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCanvasState } from "@/features/canvas";
import { useDrawing } from "@/features/canvas";
import { useElementManipulation } from "@/features/canvas";
import {
    usePersistence,
    type CanvasLineStreamEndEvent,
    type CanvasLineStreamPointsEvent,
    type CanvasLineStreamStartEvent,
} from "@/features/canvas";
import { useCanvasRendering } from "@/features/canvas";
import { useCanvasHistory } from "@/features/canvas";
import {
    CANVAS_ERASER_IMAGES_STORAGE_KEY,
    CANVAS_ERASER_LINES_STORAGE_KEY,
    CANVAS_ERASER_TEXT_BOXES_STORAGE_KEY,
    CANVAS_LIBRARY_VISIBLE_STORAGE_KEY,
    CANVAS_MANAGEMENT_TOOLBAR_STORAGE_KEY,
    CANVAS_PEN_COLOR_STORAGE_KEY,
    CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY,
    DEFAULT_PEN_COLOR,
    DEFAULT_STROKE_WIDTH,
    DEFAULT_TEXT_BOX_HEIGHT,
    DEFAULT_TEXT_BOX_WIDTH,
} from "@/features/canvas";
import { useStoredCanvasViewport } from "@/features/canvas";
import { isCanvasInteractiveTarget } from "@/features/canvas";
import { isPointInsideBounds } from "@/features/canvas";
import { getCanvasTitle } from "@/features/canvas";
import {
    buildLassoSelection,
    getLassoSelectionBounds,
    getLassoSelectionCount,
    type LassoSelection,
} from "@/features/canvas";
import { getAutoTextBoxSize } from "@/features/canvas";
import type { CanvasDocumentSummary, CanvasFolder, LineElement, Point, TextBoxElement } from "@/entities/canvas";
import { getCanvasDocuments, getCanvasFolders, createCanvasDocument } from "@/entities/canvas";
import { useLocalStorageBoolean } from "@/shared/lib/useLocalStorageBoolean";
import { subscribeSyncEvents } from "@/shared/lib/sync";
import { useLassoActions } from "../model/useLassoActions";
import { CanvasLibraryPanel } from "./CanvasLibraryPanel";
import { Toolbar } from "./Toolbar";
import "../index.css";

const isEditableKeyboardTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

const isClipboardImageFile = (file: File | null | undefined) => (
    Boolean(file && (file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name)))
);

const getClipboardImageFile = (clipboardData: DataTransfer | null) => {
    if (!clipboardData) return null;

    const fileFromFiles = Array.from(clipboardData.files).find(isClipboardImageFile);
    if (fileFromFiles) return fileFromFiles;

    for (const item of Array.from(clipboardData.items)) {
        if (item.kind !== "file" && !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!isClipboardImageFile(file) && !item.type.startsWith("image/")) continue;
        return file;
    }

    return null;
};

const Canvas = () => {
    const canvasRootRef = useRef<HTMLDivElement | null>(null);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const konvaRendererRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [viewport, setViewport] = useState(() => ({
        width: window.innerWidth,
        height: Math.max(window.innerHeight - 56, 320),
    }));

    const [canvasDocuments, setCanvasDocuments] = useState<CanvasDocumentSummary[]>([]);
    const [canvasFolders, setCanvasFolders] = useState<CanvasFolder[]>([]);
    const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
    const [isCanvasLibraryVisible, setIsCanvasLibraryVisible] = useLocalStorageBoolean(CANVAS_LIBRARY_VISIBLE_STORAGE_KEY, true);
    const [libraryError, setLibraryError] = useState<string | null>(null);

    const { offset, setOffset, scale, setScale, tool, setTool, getCanvasCoords } = useCanvasState(canvasRef);

    const {
        isDrawing,
        setIsDrawing,
        drawnLines,
        setDrawnLines,
        currentLine,
        appendPointerToCurrentLine,
        finishCurrentLine,
        eraseAtPointer,
    } = useDrawing(getCanvasCoords, tool);
    const {
        images,
        setImages,
        textBoxes,
        setTextBoxes,
        movingObject,
        setMovingObject,
        eraseElementAtPointer,
        moveElement,
    } = useElementManipulation(getCanvasCoords, tool);
    const clearHistoryRef = useRef<() => void>(() => undefined);
    const [remoteStreamingLinesById, setRemoteStreamingLinesById] = useState<Record<string, LineElement>>({});
    const handleRemoteLineStart = useCallback((event: CanvasLineStreamStartEvent) => {
        const line = event.line;
        if (!line?.id || !Array.isArray(line.points)) return;
        setRemoteStreamingLinesById((prev) => ({
            ...prev,
            [line.id]: { ...line, points: line.points.map((point) => ({ ...point })), status: "unchanged" },
        }));
    }, []);
    const handleRemoteLinePoints = useCallback((event: CanvasLineStreamPointsEvent) => {
        if (!event.lineId || !Array.isArray(event.points) || event.points.length === 0) return;
        setRemoteStreamingLinesById((prev) => {
            const current = prev[event.lineId!];
            if (!current) return prev;
            return {
                ...prev,
                [event.lineId!]: {
                    ...current,
                    points: [...current.points, ...event.points!.map((point) => ({ ...point }))],
                },
            };
        });
    }, []);
    const handleRemoteLineEnd = useCallback((event: CanvasLineStreamEndEvent) => {
        if (!event.lineId) return;
        const lineId = event.lineId;
        const line = event.line;
        setRemoteStreamingLinesById((prev) => {
            if (!line?.id || !Array.isArray(line.points)) return prev;
            return {
                ...prev,
                [lineId]: { ...line, points: line.points.map((point) => ({ ...point })), status: "unchanged" },
            };
        });
        window.setTimeout(() => {
            setRemoteStreamingLinesById((prev) => {
                if (!prev[lineId]) return prev;
                const { [lineId]: _removed, ...rest } = prev;
                return rest;
            });
        }, 10_000);
    }, []);
    const clearRemoteStreamingLines = useCallback(() => {
        setRemoteStreamingLinesById({});
        clearHistoryRef.current();
    }, []);
    const remoteStreamingLines = useMemo(() => Object.values(remoteStreamingLinesById), [remoteStreamingLinesById]);
    const streamCallbacks = useMemo(() => ({
        onLineStreamStart: handleRemoteLineStart,
        onLineStreamPoints: handleRemoteLinePoints,
        onLineStreamEnd: handleRemoteLineEnd,
        onRemoteCanvasChanged: clearRemoteStreamingLines,
    }), [clearRemoteStreamingLines, handleRemoteLineEnd, handleRemoteLinePoints, handleRemoteLineStart]);
    const {
        handleSave,
        requestSave,
        handleLoad,
        cancelCanvasLoad,
        handleImageUpload,
        addImageFile,
        handleFlushSave,
        retryPendingSaves,
        cancelPendingSaves,
        saveState,
        streamLineStart,
        streamLinePoints,
        streamLineEnd,
    } = usePersistence(
        drawnLines,
        images,
        textBoxes,
        setDrawnLines,
        setImages,
        setTextBoxes,
        selectedCanvasId,
        streamCallbacks,
    );
    const { canUndo, clearHistory, recordHistory, undo } = useCanvasHistory({
        lines: drawnLines,
        images,
        textBoxes,
        setDrawnLines,
        setImages,
        setTextBoxes,
    });
    clearHistoryRef.current = clearHistory;
    const pointers = useRef<Map<number, Point>>(new Map());
    const lastTouchDistance = useRef<number | null>(null);
    const lastTouchCenter = useRef<Point | null>(null);
    const isTouchGestureActive = useRef(false);
    const middleDragStart = useRef<Point | null>(null);
    const lassoDragStart = useRef<Point | null>(null);
    const activeStreamingLineIdRef = useRef<string | null>(null);
    const lastStreamedPointIndexRef = useRef(0);
    const handleFlushSaveRef = useRef(handleFlushSave);
    const selectedCanvasIdRef = useRef(selectedCanvasId);
    const [isMiddleDragging, setIsMiddleDragging] = useState(false);
    const [lassoSelection, setLassoSelection] = useState<LassoSelection | null>(null);
    const [isLassoDragging, setIsLassoDragging] = useState(false);
    const [pencilOnlyMode, setPencilOnlyMode] = useLocalStorageBoolean(CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY, true);
    const [penColor, setPenColor] = useState(() => localStorage.getItem(CANVAS_PEN_COLOR_STORAGE_KEY) || DEFAULT_PEN_COLOR);
    const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState("");
    const [isCanvasSettingsVisible, setIsCanvasSettingsVisible] = useState(false);
    const [isManagementToolbarVisible, setIsManagementToolbarVisible] = useLocalStorageBoolean(CANVAS_MANAGEMENT_TOOLBAR_STORAGE_KEY, true);
    const [canEraseLines, setCanEraseLines] = useLocalStorageBoolean(CANVAS_ERASER_LINES_STORAGE_KEY, true);
    const [canEraseImages, setCanEraseImages] = useLocalStorageBoolean(CANVAS_ERASER_IMAGES_STORAGE_KEY, true);
    const [canEraseTextBoxes, setCanEraseTextBoxes] = useLocalStorageBoolean(CANVAS_ERASER_TEXT_BOXES_STORAGE_KEY, true);

    const currentLineStyle = useMemo(() => ({
        color: penColor,
        strokeWidth: DEFAULT_STROKE_WIDTH,
    }), [penColor]);
    const eraserTargets = useMemo(() => ({
        lines: canEraseLines,
        images: canEraseImages,
        textBoxes: canEraseTextBoxes,
    }), [canEraseImages, canEraseLines, canEraseTextBoxes]);
    const { redrawWith, redrawActiveStroke } = useCanvasRendering(konvaRendererRef, offset, scale, currentLine.current, currentLineStyle, viewport);
    const { offsetRef, scaleRef } = useStoredCanvasViewport({
        selectedCanvasId,
        offset,
        scale,
        setOffset,
        setScale,
    });

    const editingTextBox = useMemo(
        () => textBoxes.find((textBox) => textBox.id === editingTextBoxId && textBox.status !== "deleted") ?? null,
        [editingTextBoxId, textBoxes],
    );

    const loadCanvasLibrary = useCallback(async () => {
        setLibraryError(null);
        try {
            let [documents, folders] = await Promise.all([getCanvasDocuments(), getCanvasFolders()]);
            if (documents.length === 0) {
                const created = await createCanvasDocument("기본 캔버스");
                documents = [created];
            }
            setCanvasDocuments(documents);
            setCanvasFolders(folders);
            setSelectedCanvasId((current) => {
                if (current && documents.some((document) => document.id === current)) return current;
                return documents[0]?.id ?? null;
            });
        } catch (error) {
            console.error("Failed to load canvas library:", error);
            setLibraryError("캔버스 목록을 불러오는 중 오류가 발생했습니다.");
        }
    }, []);

    useEffect(() => {
        redrawWith([...drawnLines, ...remoteStreamingLines], images, textBoxes);
    }, [offset, scale, drawnLines, images, remoteStreamingLines, textBoxes, redrawWith]);

    useEffect(() => {
        selectedCanvasIdRef.current = selectedCanvasId;
    }, [selectedCanvasId]);

    useEffect(() => {
        handleFlushSaveRef.current = handleFlushSave;
    }, [handleFlushSave]);

    useEffect(() => {
        const root = canvasRootRef.current;
        if (!root) return;

        const preventCanvasCallout = (event: Event) => {
            if (isCanvasInteractiveTarget(event.target)) return;
            event.preventDefault();
        };

        root.addEventListener("contextmenu", preventCanvasCallout);
        root.addEventListener("selectstart", preventCanvasCallout);
        root.addEventListener("dragstart", preventCanvasCallout);
        root.addEventListener("touchstart", preventCanvasCallout, { passive: false });
        root.addEventListener("touchmove", preventCanvasCallout, { passive: false });

        return () => {
            root.removeEventListener("contextmenu", preventCanvasCallout);
            root.removeEventListener("selectstart", preventCanvasCallout);
            root.removeEventListener("dragstart", preventCanvasCallout);
            root.removeEventListener("touchstart", preventCanvasCallout);
            root.removeEventListener("touchmove", preventCanvasCallout);
        };
    }, []);

    useEffect(() => {
        void loadCanvasLibrary();
    }, [loadCanvasLibrary]);

    useEffect(() => {
        if (selectedCanvasId) {
            setEditingTextBoxId(null);
            setEditingTextValue("");
            setRemoteStreamingLinesById({});
            void handleLoad("selection").then(clearHistory);
        }
    }, [clearHistory, handleLoad, selectedCanvasId]);

    useEffect(() => subscribeSyncEvents((event) => {
        if (event.resource === "canvas" || event.resource === "all") {
            void loadCanvasLibrary();
        }
    }), [loadCanvasLibrary]);

    useEffect(() => {
        if (selectedCanvasId) requestSave();
    }, [drawnLines, images, textBoxes, requestSave, selectedCanvasId]);

    useEffect(() => {
        const flushCanvasSave = () => {
            if (selectedCanvasIdRef.current) handleFlushSaveRef.current();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flushCanvasSave();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", flushCanvasSave);
        window.addEventListener("beforeunload", flushCanvasSave);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", flushCanvasSave);
            window.removeEventListener("beforeunload", flushCanvasSave);
            flushCanvasSave();
        };
    }, []);

    useEffect(() => {
        const element = canvasViewportRef.current;
        if (!element) return;

        const updateViewportSize = () => {
            const rect = element.getBoundingClientRect();
            setViewport({
                width: Math.max(Math.round(rect.width), 1),
                height: Math.max(Math.round(rect.height), 320),
            });
        };

        updateViewportSize();

        const resizeObserver = new ResizeObserver(updateViewportSize);
        resizeObserver.observe(element);
        window.addEventListener("resize", updateViewportSize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", updateViewportSize);
        };
    }, []);

    const lassoSelectionCount = getLassoSelectionCount(lassoSelection);

    const viewportCenter = useMemo(() => ({
        x: (viewport.width / 2 - offset.x) / scale,
        y: (viewport.height / 2 - offset.y) / scale,
    }), [offset.x, offset.y, scale, viewport.height, viewport.width]);

    const getDisplayedViewportCenter = () => {
        const canvas = canvasRef.current;
        if (!canvas) return viewportCenter;

        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return viewportCenter;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: ((rect.width / 2) * scaleX - offsetRef.current.x) / scaleRef.current,
            y: ((rect.height / 2) * scaleY - offsetRef.current.y) / scaleRef.current,
        };
    };

    const selectedCanvasTitle = useMemo(() => (
        getCanvasTitle(canvasDocuments, selectedCanvasId)
    ), [canvasDocuments, selectedCanvasId]);

    const lassoBounds = useMemo(() => (
        getLassoSelectionBounds(lassoSelection, drawnLines, images, textBoxes)
    ), [drawnLines, images, lassoSelection, textBoxes]);

    const flushCurrentCanvasSave = () => {
        if (selectedCanvasIdRef.current) handleFlushSaveRef.current();
    };

    const handleSelectCanvas = (canvasId: string) => {
        if (selectedCanvasIdRef.current !== canvasId) {
            flushCurrentCanvasSave();
        }
        setSelectedCanvasId(canvasId);
    };

    const toggleCanvasLibraryVisible = () => setIsCanvasLibraryVisible((current) => !current);

    const togglePencilOnlyMode = () => setPencilOnlyMode((current) => !current);

    const toggleManagementToolbarVisible = () => setIsManagementToolbarVisible((current) => !current);

    const handlePenColorChange = (color: string) => {
        setPenColor(color);
        localStorage.setItem(CANVAS_PEN_COLOR_STORAGE_KEY, color);
        setTool("pen");
    };

    const togglePenEraserTool = () => {
        setTool(tool === "eraser" ? "pen" : "eraser");
    };

    const beginTextBoxEdit = (textBox: TextBoxElement) => {
        setEditingTextBoxId(textBox.id);
        setEditingTextValue(textBox.text);
    };

    const updateEditingTextValue = (value: string) => {
        setEditingTextValue(value);
        if (!editingTextBoxId) return;

        setTextBoxes((prev) => prev.map((textBox) => {
            if (textBox.id !== editingTextBoxId) return textBox;
            const nextSize = getAutoTextBoxSize(value, textBox);
            return {
                ...textBox,
                text: value,
                width: nextSize.width,
                height: nextSize.height,
                status: textBox.status === "new" ? "new" as const : "modified" as const,
            };
        }));
    };

    const commitTextBoxEdit = () => {
        if (!editingTextBoxId) return;
        const nextText = editingTextValue.trimEnd();
        setTextBoxes((prev) => prev.flatMap((textBox) => {
            if (textBox.id !== editingTextBoxId) return [textBox];
            const nextSize = getAutoTextBoxSize(nextText, textBox);
            if (!nextText.trim()) return textBox.status === "new" ? [] : [{ ...textBox, text: "", status: "deleted" as const }];
            return [{
                ...textBox,
                text: nextText,
                width: nextSize.width,
                height: nextSize.height,
                status: textBox.status === "new" ? "new" as const : "modified" as const,
            }];
        }));
        setEditingTextBoxId(null);
        setEditingTextValue("");
    };

    const createTextBoxAt = (point: Point) => {
        const id = uuidv4();
        setTextBoxes((prev) => [...prev, {
            id,
            text: "",
            x: point.x,
            y: point.y,
            width: DEFAULT_TEXT_BOX_WIDTH,
            height: DEFAULT_TEXT_BOX_HEIGHT,
            color: penColor,
            status: "new",
        }]);
        setEditingTextBoxId(id);
        setEditingTextValue("");
    };

    const blocksTouchDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => (
        pencilOnlyMode && event.pointerType === "touch" && (tool === "pen" || tool === "eraser" || tool === "lasso")
    );

    const {
        lassoClipboard,
        moveLassoSelection,
        handleScaleLassoSelection,
        handleCopyLassoSelection,
        handlePasteLassoSelection,
        handleChangeLassoSelectionColor,
        handleDeleteLassoSelection,
    } = useLassoActions({
        lassoSelection,
        setLassoSelection,
        lassoBounds,
        drawnLines,
        images,
        textBoxes,
        setDrawnLines,
        setImages,
        setTextBoxes,
        setTool,
        recordHistory,
    });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableKeyboardTarget(event.target)) return;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                undo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                if (lassoSelectionCount > 0) {
                    event.preventDefault();
                    handleCopyLassoSelection();
                }
                return;
            }
            if (event.key === "e") setTool("eraser");
            else if (event.key === "p") setTool("pen");
            else if (event.key === "h") setTool("handle");
            else if (event.key === "t") setTool("text");
            else if (event.key === "l") setTool("lasso");
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleCopyLassoSelection, lassoSelectionCount, setTool, undo]);

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (isEditableKeyboardTarget(event.target)) return;

            const imageFile = getClipboardImageFile(event.clipboardData);
            if (!imageFile) {
                if (lassoClipboard) {
                    event.preventDefault();
                    handlePasteLassoSelection();
                }
                return;
            }

            event.preventDefault();
            recordHistory();
            void addImageFile(imageFile, getDisplayedViewportCenter());
        };

        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [addImageFile, handlePasteLassoSelection, lassoClipboard, recordHistory]);

    const resetActiveCanvasAction = () => {
        currentLine.current = [];
        activeStreamingLineIdRef.current = null;
        lastStreamedPointIndexRef.current = 0;
        setIsDrawing(false);
        setIsLassoDragging(false);
        lassoDragStart.current = null;
        setMovingObject(null);
    };

    const getCanvasViewportPoint = (canvas: HTMLCanvasElement, point: Pick<PointerEvent, "clientX" | "clientY">): Point => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (point.clientX - rect.left) * scaleX,
            y: (point.clientY - rect.top) * scaleY,
        };
    };

    const updateTouchGestureBaseline = () => {
        const touchPoints = Array.from(pointers.current.values()).slice(0, 2);
        if (touchPoints.length < 2) {
            lastTouchDistance.current = null;
            lastTouchCenter.current = null;
            return;
        }

        const [p1, p2] = touchPoints;
        lastTouchDistance.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        lastTouchCenter.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    };

    const moveViewportWithTouchGesture = () => {
        const touchPoints = Array.from(pointers.current.values()).slice(0, 2);
        if (touchPoints.length < 2) return;

        const [p1, p2] = touchPoints;
        const newDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const newCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const previousCenter = lastTouchCenter.current;

        if (lastTouchDistance.current && previousCenter) {
            const previousScale = scaleRef.current;
            const nextScale = Math.min(5, Math.max(0.2, previousScale * (newDistance / lastTouchDistance.current)));
            const zoomRatio = nextScale / previousScale;
            const previousOffset = offsetRef.current;
            const nextOffset = {
                x: newCenter.x - (previousCenter.x - previousOffset.x) * zoomRatio,
                y: newCenter.y - (previousCenter.y - previousOffset.y) * zoomRatio,
            };

            scaleRef.current = nextScale;
            offsetRef.current = nextOffset;
            setScale(nextScale);
            setOffset(nextOffset);
        }

        lastTouchDistance.current = newDistance;
        lastTouchCenter.current = newCenter;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const pos = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);
        pointers.current.set(event.pointerId, pos);
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);

        const isPenAuxiliaryAction = event.pointerType === "pen" && (event.button !== 0 || (event.buttons & 2) === 2 || (event.buttons & 32) === 32);
        if (isPenAuxiliaryAction) {
            togglePenEraserTool();
            return;
        }

        if (event.pointerType === "mouse" && event.button === 1) {
            setIsMiddleDragging(true);
            middleDragStart.current = pos;
            return;
        }

        if (event.pointerType === "touch" && pointers.current.size >= 2) {
            isTouchGestureActive.current = true;
            resetActiveCanvasAction();
            updateTouchGestureBaseline();
            return;
        }

        if (isTouchGestureActive.current || blocksTouchDrawing(event)) return;

        if (tool === "eraser") {
            if (editingTextBoxId) commitTextBoxEdit();
            setLassoSelection(null);
            recordHistory();
            eraseAtPointer(event, eraserTargets.lines);
            eraseElementAtPointer(event, { images: eraserTargets.images, textBoxes: eraserTargets.textBoxes });
        } else if (tool === "pen") {
            if (editingTextBoxId) commitTextBoxEdit();
            setLassoSelection(null);
            recordHistory();
            const lineId = uuidv4();
            currentLine.current = [];
            appendPointerToCurrentLine(event);
            activeStreamingLineIdRef.current = lineId;
            lastStreamedPointIndexRef.current = currentLine.current.length;
            streamLineStart({
                id: lineId,
                points: currentLine.current.map((point) => ({ ...point })),
                color: penColor,
                strokeWidth: DEFAULT_STROKE_WIDTH,
            });
            setIsDrawing(true);
        } else if (tool === "lasso") {
            if (editingTextBoxId) commitTextBoxEdit();
            const point = getCanvasCoords(event);
            if (lassoSelection && isPointInsideBounds(point, lassoBounds)) {
                recordHistory();
                setIsLassoDragging(true);
                lassoDragStart.current = point;
                return;
            }
            recordHistory();
            currentLine.current = [];
            appendPointerToCurrentLine(event);
            setIsDrawing(true);
        } else if (tool === "handle") {
            setLassoSelection(null);
            setMovingObject(null);
            const { x, y } = getCanvasCoords(event);
            for (let index = images.length - 1; index >= 0; index -= 1) {
                const image = images[index];
                if (image.status !== "deleted" && x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height) {
                    if (editingTextBoxId) commitTextBoxEdit();
                    recordHistory();
                    setMovingObject({ type: "image", index, id: image.id, status: image.status || "new", grabOffset: { x: x - image.x, y: y - image.y } });
                    return;
                }
            }
            for (let index = textBoxes.length - 1; index >= 0; index -= 1) {
                const textBox = textBoxes[index];
                if (textBox.status !== "deleted" && x >= textBox.x && x <= textBox.x + textBox.width && y >= textBox.y && y <= textBox.y + textBox.height) {
                    if (editingTextBoxId) commitTextBoxEdit();
                    recordHistory();
                    setMovingObject({ type: "text", index, id: textBox.id, status: textBox.status || "new", grabOffset: { x: x - textBox.x, y: y - textBox.y } });
                    return;
                }
            }
        } else if (tool === "text") {
            setLassoSelection(null);
            recordHistory();
            const point = getCanvasCoords(event);
            const targetTextBox = [...textBoxes].reverse().find((textBox) => (
                textBox.status !== "deleted"
                && point.x >= textBox.x
                && point.x <= textBox.x + textBox.width
                && point.y >= textBox.y
                && point.y <= textBox.y + textBox.height
            ));
            if (targetTextBox) beginTextBoxEdit(targetTextBox);
            else {
                if (editingTextBoxId) commitTextBoxEdit();
                createTextBoxAt(point);
            }
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const pos = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);

        if (isMiddleDragging && middleDragStart.current) {
            const nextOffset = {
                x: offsetRef.current.x + pos.x - middleDragStart.current.x,
                y: offsetRef.current.y + pos.y - middleDragStart.current.y,
            };
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            middleDragStart.current = pos;
            return;
        }

        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, pos);

        if (isTouchGestureActive.current && pointers.current.size >= 2) {
            moveViewportWithTouchGesture();
            return;
        }
        if (isTouchGestureActive.current) return;

        if (isLassoDragging && lassoDragStart.current) {
            const current = getCanvasCoords(event);
            moveLassoSelection(current.x - lassoDragStart.current.x, current.y - lassoDragStart.current.y);
            lassoDragStart.current = current;
        } else if (blocksTouchDrawing(event)) {
            return;
        } else if (tool === "eraser") {
            eraseAtPointer(event, eraserTargets.lines);
            eraseElementAtPointer(event, { images: eraserTargets.images, textBoxes: eraserTargets.textBoxes });
        } else if ((tool === "pen" || tool === "lasso") && isDrawing) {
            const previousPointCount = currentLine.current.length;
            appendPointerToCurrentLine(event);
            if (tool === "pen" && activeStreamingLineIdRef.current) {
                const newPoints = currentLine.current.slice(Math.max(previousPointCount, lastStreamedPointIndexRef.current));
                if (newPoints.length > 0) {
                    lastStreamedPointIndexRef.current = currentLine.current.length;
                    streamLinePoints(activeStreamingLineIdRef.current, newPoints.map((point) => ({ ...point })));
                }
            }
            redrawActiveStroke();
        } else if (tool === "handle" && movingObject) {
            moveElement(event);
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        pointers.current.delete(event.pointerId);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

        if (isMiddleDragging && event.button === 1) {
            setIsMiddleDragging(false);
            middleDragStart.current = null;
        }

        if (isTouchGestureActive.current) {
            if (pointers.current.size >= 2) updateTouchGestureBaseline();
            else {
                lastTouchDistance.current = null;
                lastTouchCenter.current = null;
            }
            if (pointers.current.size === 0) isTouchGestureActive.current = false;
            return;
        }

        if (isLassoDragging) {
            setIsLassoDragging(false);
            lassoDragStart.current = null;
        } else if ((tool === "pen" || tool === "lasso") && isDrawing) {
            const previousPointCount = currentLine.current.length;
            appendPointerToCurrentLine(event);
            if (tool === "pen" && activeStreamingLineIdRef.current) {
                const newPoints = currentLine.current.slice(Math.max(previousPointCount, lastStreamedPointIndexRef.current));
                if (newPoints.length > 0) {
                    lastStreamedPointIndexRef.current = currentLine.current.length;
                    streamLinePoints(activeStreamingLineIdRef.current, newPoints.map((point) => ({ ...point })));
                }
            }
            const finishedLine = finishCurrentLine();
            if (tool === "lasso") {
                setLassoSelection(buildLassoSelection(finishedLine, drawnLines, images, textBoxes));
            } else if (finishedLine.length > 0) {
                const lineId = activeStreamingLineIdRef.current ?? uuidv4();
                const line = {
                    id: lineId,
                    points: finishedLine,
                    color: penColor,
                    strokeWidth: DEFAULT_STROKE_WIDTH,
                };
                streamLineEnd(line);
                setDrawnLines((prev) => [...prev, {
                    ...line,
                    status: "new",
                }]);
            }
            activeStreamingLineIdRef.current = null;
            lastStreamedPointIndexRef.current = 0;
        }
        setMovingObject(null);
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const previousScale = scaleRef.current;
        const nextScale = Math.min(5, Math.max(0.2, previousScale * factor));
        const zoomRatio = nextScale / previousScale;
        if (zoomRatio === 1) return; // 스케일 한계 도달 시 위치 이동 없이 종료

        // 0,0 이 아니라 마우스 포인터 좌표를 기준으로 확대/축소 (캔버스 픽셀 공간, 터치 핀치줌과 동일 공식)
        const focus = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);
        const previousOffset = offsetRef.current;
        const nextOffset = {
            x: focus.x - (focus.x - previousOffset.x) * zoomRatio,
            y: focus.y - (focus.y - previousOffset.y) * zoomRatio,
        };

        scaleRef.current = nextScale;
        offsetRef.current = nextOffset;
        setScale(nextScale);
        setOffset(nextOffset);
    };

    const handleContextMenu = (event: React.MouseEvent) => event.preventDefault();

    return (
        <div
            ref={canvasRootRef}
            className="canvas-touch-root flex h-[calc(100vh-56px)] w-full flex-col overflow-hidden bg-stone-50 text-stone-900"
            onContextMenu={handleContextMenu}
            style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        >
            <Toolbar
                canvasTitle={selectedCanvasTitle}
                tool={tool}
                setTool={setTool}
                handleImageUpload={async (event) => {
                    if (event.target.files?.[0]) recordHistory();
                    await handleImageUpload(event, getDisplayedViewportCenter());
                }}
                handleSave={handleSave}
                handleLoad={handleLoad}
                cancelCanvasLoad={cancelCanvasLoad}
                retryPendingSaves={retryPendingSaves}
                cancelPendingSaves={cancelPendingSaves}
                saveState={saveState}
                handleUndo={undo}
                canUndo={canUndo}
                lassoSelectionCount={lassoSelectionCount}
                hasCopiedLassoSelection={Boolean(lassoClipboard)}
                onCopyLassoSelection={handleCopyLassoSelection}
                onPasteLassoSelection={handlePasteLassoSelection}
                onDeleteLassoSelection={handleDeleteLassoSelection}
                onScaleLassoSelection={handleScaleLassoSelection}
                onChangeLassoSelectionColor={handleChangeLassoSelectionColor}
                onClearLassoSelection={() => setLassoSelection(null)}
                penColor={penColor}
                onPenColorChange={handlePenColorChange}
                isCanvasSettingsVisible={isCanvasSettingsVisible}
                onToggleCanvasSettingsVisible={() => setIsCanvasSettingsVisible((current) => !current)}
                zoomPercent={Math.round(scale * 100)}
                viewportCenter={viewportCenter}
            />
            <div ref={canvasViewportRef} className="relative min-h-0 flex-1 overflow-hidden">
                {isCanvasSettingsVisible && (
                    <div
                        data-canvas-touch-allow="true"
                        className="absolute right-4 top-4 z-40 w-72 rounded-lg border border-stone-300 bg-white p-3 text-stone-900 shadow-xl"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase text-amber-700">Canvas Settings</p>
                                <h2 className="text-base font-black">그림판 설정</h2>
                            </div>
                            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setIsCanvasSettingsVisible(false)} title="설정 닫기">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid gap-2 text-sm">
                            <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2">
                                <span className="font-semibold">관리 툴바</span>
                                <input type="checkbox" checked={isManagementToolbarVisible} onChange={toggleManagementToolbarVisible} />
                            </label>
                            <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2">
                                <span className="font-semibold">캔버스 폴더</span>
                                <input type="checkbox" checked={isCanvasLibraryVisible} onChange={toggleCanvasLibraryVisible} />
                            </label>
                            <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2">
                                <span className="font-semibold">펜슬 전용 그리기</span>
                                <input type="checkbox" checked={pencilOnlyMode} onChange={togglePencilOnlyMode} />
                            </label>
                            <div className="rounded-md border border-stone-200 p-3">
                                <p className="mb-2 text-xs font-bold text-stone-500">지우개 대상</p>
                                <div className="grid gap-2">
                                    <label className="flex min-h-9 items-center justify-between gap-3">
                                        <span className="text-sm font-semibold">선</span>
                                        <input type="checkbox" checked={canEraseLines} onChange={() => setCanEraseLines((current) => !current)} />
                                    </label>
                                    <label className="flex min-h-9 items-center justify-between gap-3">
                                        <span className="text-sm font-semibold">이미지</span>
                                        <input type="checkbox" checked={canEraseImages} onChange={() => setCanEraseImages((current) => !current)} />
                                    </label>
                                    <label className="flex min-h-9 items-center justify-between gap-3">
                                        <span className="text-sm font-semibold">텍스트 박스</span>
                                        <input type="checkbox" checked={canEraseTextBoxes} onChange={() => setCanEraseTextBoxes((current) => !current)} />
                                    </label>
                                </div>
                            </div>
                            <div className="rounded-md border border-stone-200 px-3 py-2">
                                <p className="text-xs font-bold text-stone-500">펜슬 도구 전환</p>
                                <p className="mt-1 text-xs text-stone-700">브라우저가 펜슬 보조 버튼 이벤트를 노출할 때 펜과 지우개를 전환합니다.</p>
                            </div>
                        </div>
                    </div>
                )}
                <CanvasLibraryPanel
                    documents={canvasDocuments}
                    folders={canvasFolders}
                    selectedCanvasId={selectedCanvasId}
                    libraryError={libraryError}
                    isVisible={isCanvasLibraryVisible}
                    onToggleVisible={toggleCanvasLibraryVisible}
                    onSelectCanvas={handleSelectCanvas}
                    onFlushCurrentCanvasSave={flushCurrentCanvasSave}
                    setCanvasDocuments={setCanvasDocuments}
                    setCanvasFolders={setCanvasFolders}
                    setSelectedCanvasId={setSelectedCanvasId}
                    setLibraryError={setLibraryError}
                />

                <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" width={viewport.width} height={viewport.height} viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">
                <rect width="100%" height="100%" fill="#fafaf9" />
                <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
                    {Array.from({ length: 22 }).map((_, index) => (
                        <line key={`vector-map-x-${index}`} x1={index * 120} y1={0} x2={index * 120} y2={2520} stroke="#e7e5e4" strokeWidth={1} />
                    ))}
                    {Array.from({ length: 22 }).map((_, index) => (
                        <line key={`vector-map-y-${index}`} x1={0} y1={index * 120} x2={2520} y2={index * 120} stroke="#e7e5e4" strokeWidth={1} />
                    ))}
                </g>
                </svg>

                <div
                    ref={konvaRendererRef}
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{ width: viewport.width, height: viewport.height }}
                    aria-hidden="true"
                />

                <canvas
                    ref={canvasRef}
                    width={viewport.width}
                    height={viewport.height}
                    className="relative z-20 block"
                    style={{
                        backgroundColor: "transparent",
                        border: "1px solid #292524",
                        touchAction: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        cursor: isMiddleDragging ? "grabbing" : isDrawing ? "crosshair" : tool === "eraser" ? "cell" : tool === "lasso" ? "copy" : tool === "handle" ? "move" : "default",
                    }}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onContextMenu={handleContextMenu}
                />

                {editingTextBox && (
                    <textarea
                        data-canvas-touch-allow="true"
                        className="absolute z-30 resize-none overflow-hidden rounded-md border-2 border-blue-500 bg-white/95 p-2 font-bold leading-[1.4] text-stone-900 shadow-lg outline-none"
                        value={editingTextValue}
                        onChange={(event) => updateEditingTextValue(event.target.value)}
                        onBlur={commitTextBoxEdit}
                        onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                event.preventDefault();
                                commitTextBoxEdit();
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                setEditingTextBoxId(null);
                                setEditingTextValue("");
                            }
                        }}
                        style={{
                            left: offset.x + editingTextBox.x * scale,
                            top: offset.y + editingTextBox.y * scale,
                            width: Math.max(140, editingTextBox.width * scale),
                            height: Math.max(48, editingTextBox.height * scale),
                            fontSize: Math.min(28, Math.max(12, 16 * scale)),
                        }}
                        autoFocus
                    />
                )}

                {lassoBounds && (
                    <div
                        className="pointer-events-none absolute border-2 border-dashed border-blue-500 bg-blue-500/10"
                        style={{
                            left: offset.x + lassoBounds.minX * scale,
                            top: offset.y + lassoBounds.minY * scale,
                            width: Math.max(1, (lassoBounds.maxX - lassoBounds.minX) * scale),
                            height: Math.max(1, (lassoBounds.maxY - lassoBounds.minY) * scale),
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default Canvas;
