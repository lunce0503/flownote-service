import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCanvasState } from "@/features/canvas";
import { APPLE_PENCIL_DOUBLE_TAP_EVENT, nextApplePencilTool } from "@/features/canvas";
import { useDrawing } from "@/features/canvas";
import { useElementManipulation } from "@/features/canvas";
import { usePersistence } from "@/features/canvas";
import { useCanvasRendering } from "@/features/canvas";
import { useCanvasHistory } from "@/features/canvas";
import { useLineStreaming } from "@/features/canvas";
import {
    CANVAS_ERASER_IMAGES_STORAGE_KEY,
    CANVAS_ERASER_LINES_STORAGE_KEY,
    CANVAS_ERASER_TEXT_BOXES_STORAGE_KEY,
    CANVAS_PEN_COLOR_STORAGE_KEY,
    CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY,
    DEFAULT_PEN_COLOR,
    DEFAULT_STROKE_WIDTH,
    DEFAULT_TEXT_BOX_HEIGHT,
    DEFAULT_TEXT_BOX_WIDTH,
} from "@/features/canvas";
import { useStoredCanvasViewport } from "@/features/canvas";
import { isCanvasInteractiveTarget } from "@/features/canvas";
import { getCanvasTitle } from "@/features/canvas";
import {
    getLassoSelectionBounds,
    getLassoSelectionCount,
    type LassoSelection,
} from "@/features/canvas";
import { getAutoTextBoxSize } from "@/features/canvas";
import { isPdfFile, renderPdfPagesToImageFiles } from "@/features/canvas";
import type { CanvasDocumentSummary, Point, TextBoxElement } from "@/entities/canvas";
import { getCanvasDocuments, updateCanvasDocument } from "@/entities/canvas";
import { useLocalStorageBoolean } from "@/shared/lib/useLocalStorageBoolean";
import { useDocumentTitle } from "@/shared/lib/useDocumentTitle";
import { subscribeSyncEvents } from "@/shared/lib/sync";
import { useCanvasPointerInput } from "../model/useCanvasPointerInput";
import { useLassoActions } from "../model/useLassoActions";
import { Toolbar } from "./Toolbar";
import { CanvasPlannerSuggestions } from "./CanvasPlannerSuggestions";
import { CanvasPdfReader } from "./CanvasPdfReader";
import { CanvasToolPointer } from "./CanvasToolPointer";
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

type AssetImportState = {
    status: "idle" | "importing" | "complete" | "failed";
    message: string;
};

const Canvas = () => {
    const canvasRootRef = useRef<HTMLDivElement | null>(null);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const konvaRendererRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const root = canvasRootRef.current;
        if (!root) return;
        const resize = () => {
            // Use the actual header edge, including its border and large-font mode.
            const bottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
            root.style.height = `${Math.max(1, Math.floor(bottom - root.getBoundingClientRect().top))}px`;
        };
        resize();
        const observer = new ResizeObserver(resize);
        const header = document.querySelector("header");
        if (header) observer.observe(header);
        window.addEventListener("resize", resize);
        document.addEventListener("fullscreenchange", resize);
        window.visualViewport?.addEventListener("resize", resize);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", resize);
            document.removeEventListener("fullscreenchange", resize);
            window.visualViewport?.removeEventListener("resize", resize);
        };
    }, []);
    const [viewport, setViewport] = useState(() => ({
        width: window.innerWidth,
        height: Math.max(window.innerHeight - 56, 320),
    }));

    const [canvasDocuments, setCanvasDocuments] = useState<CanvasDocumentSummary[]>([]);
    const { canvasId: routeCanvasId } = useParams<{ canvasId: string }>();
    const navigate = useNavigate();
    const selectedCanvasId = routeCanvasId ?? null;

    const { offset, setOffset, scale, setScale, tool, setTool, getCanvasCoords } = useCanvasState(canvasRef);
    const previousPencilToolRef = useRef<typeof tool>('pen');

    useEffect(() => {
        const handlePencilDoubleTap = () => {
            setTool((current) => {
                const next = nextApplePencilTool(current, previousPencilToolRef.current);
                previousPencilToolRef.current = next.previous;
                return next.tool;
            });
        };
        window.addEventListener(APPLE_PENCIL_DOUBLE_TAP_EVENT, handlePencilDoubleTap);
        return () => window.removeEventListener(APPLE_PENCIL_DOUBLE_TAP_EVENT, handlePencilDoubleTap);
    }, [setTool]);

    const {
        isDrawing,
        setIsDrawing,
        drawnLines,
        setDrawnLines,
        currentLineRef,
        appendPointerToCurrentLine,
        finishCurrentLine,
        eraseAtPointer,
    } = useDrawing(getCanvasCoords);
    const {
        images,
        setImages,
        textBoxes,
        setTextBoxes,
        movingObject,
        setMovingObject,
        eraseElementAtPointer,
        moveElement,
    } = useElementManipulation(getCanvasCoords);
    const { canUndo, clearHistory, recordHistory, undo } = useCanvasHistory({
        lines: drawnLines,
        images,
        textBoxes,
        setDrawnLines,
        setImages,
        setTextBoxes,
    });
    const {
        remoteLines: remoteStreamingLines,
        streamCallbacks,
        beginLocalLine,
        streamLocalPoints,
        finishLocalLine,
        resetLocalLine,
        clearRemoteLines,
    } = useLineStreaming(clearHistory);
    const {
        handleSave,
        requestSave,
        handleLoad,
        cancelCanvasLoad,
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
    const handleFlushSaveRef = useRef(handleFlushSave);
    const selectedCanvasIdRef = useRef(selectedCanvasId);
    const [lassoSelection, setLassoSelection] = useState<LassoSelection | null>(null);
    const [pencilOnlyMode, setPencilOnlyMode] = useLocalStorageBoolean(CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY, true);
    const [penColor, setPenColor] = useState(() => localStorage.getItem(CANVAS_PEN_COLOR_STORAGE_KEY) || DEFAULT_PEN_COLOR);
    const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState("");
    const editingTextBoxSnapshotRef = useRef<TextBoxElement | null>(null);
    const skipTextBlurCommitRef = useRef(false);
    const [isCanvasSettingsVisible, setIsCanvasSettingsVisible] = useState(false);
    const [isPlannerSuggestionsVisible, setIsPlannerSuggestionsVisible] = useState(false);
    const [isPdfReaderVisible, setIsPdfReaderVisible] = useState(false);
    const [assetImportState, setAssetImportState] = useState<AssetImportState>({
        status: "idle",
        message: "이미지 또는 PDF 추가",
    });
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
    const renderLines = useMemo(
        () => [...drawnLines, ...remoteStreamingLines],
        [drawnLines, remoteStreamingLines],
    );
    const { redrawWith, redrawActiveStroke } = useCanvasRendering(konvaRendererRef, offset, scale, currentLineRef, currentLineStyle, viewport);
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

    const loadCanvasDocuments = useCallback(async () => {
        try {
            setCanvasDocuments(await getCanvasDocuments());
        } catch (error) {
            console.error("Failed to load canvas documents:", error);
        }
    }, []);

    useEffect(() => {
        redrawWith(renderLines, images, textBoxes);
    }, [images, redrawWith, renderLines, textBoxes]);

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
        const timer = window.setTimeout(() => void loadCanvasDocuments(), 0);
        return () => window.clearTimeout(timer);
    }, [loadCanvasDocuments]);

    useEffect(() => {
        if (!selectedCanvasId) return undefined;
        let active = true;
        const loadSelection = async () => {
            await Promise.resolve();
            if (!active) return;
            setEditingTextBoxId(null);
            setEditingTextValue("");
            clearRemoteLines();
            await handleLoad("selection");
            if (active) clearHistory();
        };
        void loadSelection();
        return () => { active = false; };
    }, [clearHistory, clearRemoteLines, handleLoad, selectedCanvasId]);

    useEffect(() => subscribeSyncEvents((event) => {
        if (event.resource === "canvas" || event.resource === "all") {
            void loadCanvasDocuments();
        }
    }), [loadCanvasDocuments]);

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
                height: Math.max(Math.floor(rect.height), 1),
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

    const getDisplayedViewportCenter = useCallback(() => {
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
    }, [offsetRef, scaleRef, viewportCenter]);

    const selectedCanvasTitle = useMemo(() => (
        getCanvasTitle(canvasDocuments, selectedCanvasId)
    ), [canvasDocuments, selectedCanvasId]);
    useDocumentTitle("캔버스", selectedCanvasTitle || selectedCanvasId || "캔버스");

    const handleRenameCanvas = useCallback(async (title: string) => {
        if (!selectedCanvasId) throw new Error("선택된 캔버스가 없습니다.");
        const updated = await updateCanvasDocument(selectedCanvasId, title);
        setCanvasDocuments((current) => current.some((document) => document.id === updated.id)
            ? current.map((document) => document.id === updated.id ? updated : document)
            : [updated, ...current]);
    }, [selectedCanvasId]);

    const handleAssetUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (selectedFiles.length === 0) return;

        recordHistory();
        setAssetImportState({ status: "importing", message: "파일을 캔버스로 가져오는 중" });
        const placementCenter = getDisplayedViewportCenter();
        let placementIndex = 0;
        let importedCount = 0;
        let failedCount = 0;

        for (const file of selectedFiles) {
            try {
                setAssetImportState({
                    status: "importing",
                    message: isPdfFile(file) ? `${file.name} 페이지를 변환하는 중` : `${file.name} 가져오는 중`,
                });
                const imageFiles = isPdfFile(file) ? await renderPdfPagesToImageFiles(file) : [file];
                for (const imageFile of imageFiles) {
                    const added = await addImageFile(imageFile, {
                        x: placementCenter.x,
                        y: placementCenter.y + placementIndex * 840,
                    });
                    placementIndex += 1;
                    if (added) importedCount += 1;
                    else failedCount += 1;
                }
            } catch (importError) {
                console.error("Failed to import a canvas asset:", importError);
                failedCount += 1;
            }
        }

        if (importedCount > 0) {
            setTool("lasso");
            setAssetImportState({
                status: failedCount > 0 ? "failed" : "complete",
                message: failedCount > 0
                    ? `${importedCount}개를 가져왔고 ${failedCount}개는 실패했습니다.`
                    : `${importedCount}개를 가져왔습니다. 올가미로 이동하거나 크기를 바꿀 수 있습니다.`,
            });
        } else {
            setAssetImportState({ status: "failed", message: "파일을 가져오지 못했습니다." });
        }
    }, [addImageFile, getDisplayedViewportCenter, recordHistory, setTool]);

    useEffect(() => {
        if (assetImportState.status !== "complete") return;
        const timer = window.setTimeout(() => setAssetImportState({
            status: "idle",
            message: "이미지 또는 PDF 추가",
        }), 5_000);
        return () => window.clearTimeout(timer);
    }, [assetImportState.status]);

    const lassoBounds = useMemo(() => (
        getLassoSelectionBounds(lassoSelection, drawnLines, images, textBoxes)
    ), [drawnLines, images, lassoSelection, textBoxes]);

    const togglePencilOnlyMode = () => setPencilOnlyMode((current) => !current);


    const handlePenColorChange = (color: string) => {
        setPenColor(color);
        localStorage.setItem(CANVAS_PEN_COLOR_STORAGE_KEY, color);
        setTool("pen");
    };

    const togglePenEraserTool = () => {
        setTool(tool === "eraser" ? "pen" : "eraser");
    };

    const beginTextBoxEdit = (textBox: TextBoxElement) => {
        editingTextBoxSnapshotRef.current = { ...textBox };
        skipTextBlurCommitRef.current = false;
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
        editingTextBoxSnapshotRef.current = null;
    };

    const cancelTextBoxEdit = () => {
        if (!editingTextBoxId) return;
        const original = editingTextBoxSnapshotRef.current;
        skipTextBlurCommitRef.current = true;
        setTextBoxes((prev) => original
            ? prev.map((textBox) => (textBox.id === editingTextBoxId ? original : textBox))
            : prev.filter((textBox) => textBox.id !== editingTextBoxId));
        setEditingTextBoxId(null);
        setEditingTextValue("");
        editingTextBoxSnapshotRef.current = null;
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
        editingTextBoxSnapshotRef.current = null;
        skipTextBlurCommitRef.current = false;
        setEditingTextBoxId(id);
        setEditingTextValue("");
    };

    const {
        lassoClipboard,
        moveLassoSelection,
        handleScaleLassoSelection,
        handleCopyLassoSelection,
        handlePasteLassoSelection,
        handleChangeLassoSelectionColor,
        handleDeleteLassoSelection,
        handleBringLassoSelectionToFront,
        handleSendLassoSelectionToBack,
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

    const {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handleLostPointerCapture,
        handleWheel,
        isMiddleDragging,
    } = useCanvasPointerInput({
        canvasId: selectedCanvasId,
        tool,
        pencilOnlyMode,
        penColor,
        offsetRef,
        scaleRef,
        setOffset,
        setScale,
        getCanvasCoords,
        isDrawing,
        setIsDrawing,
        currentLineRef,
        appendPointerToCurrentLine,
        finishCurrentLine,
        eraseAtPointer,
        drawnLines,
        setDrawnLines,
        images,
        textBoxes,
        movingObject,
        setMovingObject,
        eraseElementAtPointer,
        moveElement,
        eraserTargets,
        editingTextBoxId,
        commitTextBoxEdit,
        beginTextBoxEdit,
        createTextBoxAt,
        lassoSelection,
        setLassoSelection,
        lassoBounds,
        moveLassoSelection,
        recordHistory,
        redrawActiveStroke,
        togglePenEraserTool,
        beginLocalLine,
        streamLocalPoints,
        finishLocalLine,
        resetLocalLine,
        streamLineStart,
        streamLinePoints,
        streamLineEnd,
        createLineId: uuidv4,
        strokeWidth: DEFAULT_STROKE_WIDTH,
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
    }, [addImageFile, getDisplayedViewportCenter, handlePasteLassoSelection, lassoClipboard, recordHistory]);

    const handleContextMenu = (event: React.MouseEvent) => event.preventDefault();

    return (
        <div
            ref={canvasRootRef}
            className="canvas-touch-root flex w-full flex-col overflow-hidden bg-stone-50 text-stone-900"
            onContextMenu={handleContextMenu}
            style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: isPdfReaderVisible ? "auto" : "none" }}
        >
            <div className="canvas-reading-layout flex min-h-0 flex-1 flex-col lg:flex-row">
            <div ref={canvasViewportRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {/* 툴바는 폴더 패널과 같이 캔버스 위에 떠 있는 오버레이다(문서 흐름에서 제외 → 캔버스 전체 높이 사용). */}
                <Toolbar
                    canvasTitle={selectedCanvasTitle}
                    onNavigateToCanvasList={() => navigate("/canvas")}
                    onRenameCanvas={handleRenameCanvas}
                    tool={tool}
                    setTool={setTool}
                    handleAssetUpload={handleAssetUpload}
                    isImportingAssets={assetImportState.status === "importing"}
                    assetImportMessage={assetImportState.message}
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
                    onBringLassoSelectionToFront={handleBringLassoSelectionToFront}
                    onSendLassoSelectionToBack={handleSendLassoSelectionToBack}
                    onClearLassoSelection={() => setLassoSelection(null)}
                    penColor={penColor}
                    onPenColorChange={handlePenColorChange}
                    isCanvasSettingsVisible={isCanvasSettingsVisible}
                    onToggleCanvasSettingsVisible={() => setIsCanvasSettingsVisible((current) => !current)}
                    onOpenPlannerSuggestions={() => { setIsCanvasSettingsVisible(false); setIsPlannerSuggestionsVisible(true); }}
                    onOpenPdfReader={() => { setIsCanvasSettingsVisible(false); setIsPlannerSuggestionsVisible(false); setIsPdfReaderVisible(true); }}
                    zoomPercent={Math.round(scale * 100)}
                    viewportCenter={viewportCenter}
                />
                {isPlannerSuggestionsVisible && <CanvasPlannerSuggestions key={selectedCanvasId} canvasTitle={selectedCanvasTitle} textBoxes={textBoxes} onClose={() => setIsPlannerSuggestionsVisible(false)} />}
                {assetImportState.status !== "idle" && (
                    <div
                        data-canvas-touch-allow="true"
                        className={`fixed bottom-3 right-3 z-50 max-w-[min(24rem,calc(100vw-1.5rem))] rounded-md px-3 py-2 text-sm font-semibold shadow-lg ring-1 ${assetImportState.status === "failed" ? "bg-red-50 text-red-800 ring-red-200" : "bg-white text-stone-800 ring-stone-200"}`}
                        role="status"
                        aria-live="polite"
                    >
                        <span className="inline-flex items-center gap-2">
                            {assetImportState.status === "importing" && <Loader2 size={16} className="animate-spin" />}
                            {assetImportState.message}
                        </span>
                    </div>
                )}
                {isCanvasSettingsVisible && (
                    <div
                        data-canvas-touch-allow="true"
                        className="absolute right-4 top-20 z-40 w-72 rounded-lg border border-stone-300 bg-white p-3 text-stone-900 shadow-xl"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase text-amber-700">Canvas Settings</p>
                                <h2 className="text-base font-black">캔버스 설정</h2>
                            </div>
                            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setIsCanvasSettingsVisible(false)} title="설정 닫기">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid gap-2 text-sm">
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
                    data-testid="canvas-render-surface"
                    data-visible-line-count={drawnLines.filter((line) => line.status !== "deleted").length}
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{ width: viewport.width, height: viewport.height }}
                    aria-hidden="true"
                />

                <canvas
                    data-testid="canvas-input-surface"
                    data-ready={saveState.status !== "loading"}
                    ref={canvasRef}
                    width={viewport.width}
                    height={viewport.height}
                    className="relative z-20 block"
                    style={{
                        backgroundColor: "transparent",
                        boxShadow: "inset 0 0 0 1px #292524",
                        touchAction: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        WebkitTouchCallout: "none",
                        pointerEvents: saveState.status === "loading" ? "none" : "auto",
                        cursor: isMiddleDragging ? "grabbing" : isDrawing ? "crosshair" : tool === "eraser" ? "cell" : tool === "lasso" ? "copy" : tool === "handle" ? "move" : "default",
                    }}
                    aria-disabled={saveState.status === "loading"}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onLostPointerCapture={handleLostPointerCapture}
                    onPointerLeave={handlePointerUp}
                    onContextMenu={handleContextMenu}
                />

                {saveState.status !== "loading" && (
                    <CanvasToolPointer key={`tool-pointer:${selectedCanvasId}`} canvasRef={canvasRef} tool={tool} pencilOnlyMode={pencilOnlyMode} />
                )}

                {editingTextBox && (
                    <textarea
                        data-canvas-touch-allow="true"
                        className="absolute z-30 resize-none overflow-hidden rounded-md border-2 border-blue-500 bg-white/95 p-2 font-bold leading-[1.4] text-stone-900 shadow-lg outline-none"
                        value={editingTextValue}
                        placeholder="텍스트 입력"
                        onChange={(event) => updateEditingTextValue(event.target.value)}
                        onBlur={() => {
                            if (skipTextBlurCommitRef.current) {
                                skipTextBlurCommitRef.current = false;
                                return;
                            }
                            commitTextBoxEdit();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                commitTextBoxEdit();
                                setTool("handle");
                            }
                            if (event.key === "Escape") {
                                event.preventDefault();
                                cancelTextBoxEdit();
                                setTool("handle");
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
            {isPdfReaderVisible && <CanvasPdfReader key={selectedCanvasId} onClose={() => {
                setIsPdfReaderVisible(false);
                const buttons = canvasRootRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-label="PDF 책 읽기"], button[aria-label="파일 동작"]');
                Array.from(buttons ?? []).find((button) => button.getClientRects().length > 0)?.focus();
            }} />}
            </div>
        </div>
    );
};

export default Canvas;
