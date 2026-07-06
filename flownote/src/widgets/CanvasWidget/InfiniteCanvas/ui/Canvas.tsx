import React, { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Check, ChevronDown, ChevronRight, Folder, MoreVertical, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCanvasState } from "../../../../features/canvas/model/useCanvasState";
import { useDrawing } from "../../../../features/canvas/model/useDrawing";
import { useElementManipulation } from "../../../../features/canvas/model/useElementManipulation";
import {
    usePersistence,
    type CanvasLineStreamEndEvent,
    type CanvasLineStreamPointsEvent,
    type CanvasLineStreamStartEvent,
} from "../../../../features/canvas/model/usePersistence";
import { useCanvasRendering } from "../../../../features/canvas/model/useCanvasRendering";
import { useCanvasHistory } from "../../../../features/canvas/model/useCanvasHistory";
import {
    CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY,
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
} from "../../../../features/canvas/model/canvasConstants";
import { useStoredCanvasViewport } from "../../../../features/canvas/model/useStoredCanvasViewport";
import { isCanvasInteractiveTarget } from "../../../../features/canvas/model/canvasDom";
import { isPointInsideBounds, markModified } from "../../../../features/canvas/model/canvasGeometry";
import {
    buildCanvasFolderIdByCanvasId,
    getCanvasTitle,
    getUnfiledCanvases,
    groupCanvasFoldersByCategory,
} from "../../../../features/canvas/model/canvasLibraryModel";
import {
    buildLassoSelection,
    getLassoSelectionBounds,
    getLassoSelectionCount,
    type LassoSelection,
} from "../../../../features/canvas/model/canvasSelectionModel";
import { getAutoTextBoxSize } from "../../../../features/canvas/model/canvasTextBoxModel";
import type { CanvasDocumentSummary, CanvasFolder, ImageElement, LineElement, Point, TextBoxElement } from "../../../../entities/canvas/model/types";
import {
    addCanvasToFolder,
    createCanvasDocument,
    createCanvasFolder,
    deleteCanvasDocument,
    deleteCanvasFolder,
    getCanvasDocuments,
    getCanvasFolders,
    removeCanvasFromFolder,
    updateCanvasDocument,
    updateCanvasFolder,
} from "../../../../entities/canvas/api/canvasLibraryData";
import { useLocalStorageBoolean } from "../../../../shared/lib/useLocalStorageBoolean";
import { useLocalStorageStringSet } from "../../../../shared/lib/useLocalStorageStringSet";
import { subscribeSyncEvents } from "../../../../shared/sync";
import { Toolbar } from "./Toolbar";
import "../index.css";

type FolderForm = {
    category: string;
    name: string;
};

type LassoClipboard = {
    lines: LineElement[];
    images: ImageElement[];
    textBoxes: TextBoxElement[];
};

const EMPTY_FOLDER_FORM: FolderForm = {
    category: "",
    name: "",
};

const LASSO_PASTE_OFFSET = 32;

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
    const [folderForm, setFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editingFolderForm, setEditingFolderForm] = useState<FolderForm>(EMPTY_FOLDER_FORM);
    const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
    const [editingCanvasTitle, setEditingCanvasTitle] = useState("");
    const [openCanvasMenuId, setOpenCanvasMenuId] = useState<string | null>(null);
    const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
    const [collapsedFolderIds, setCollapsedFolderIds] = useLocalStorageStringSet(CANVAS_COLLAPSED_FOLDER_IDS_STORAGE_KEY);
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
    const lassoPasteCountRef = useRef(0);
    const activeStreamingLineIdRef = useRef<string | null>(null);
    const lastStreamedPointIndexRef = useRef(0);
    const handleFlushSaveRef = useRef(handleFlushSave);
    const selectedCanvasIdRef = useRef(selectedCanvasId);
    const [isMiddleDragging, setIsMiddleDragging] = useState(false);
    const [lassoSelection, setLassoSelection] = useState<LassoSelection | null>(null);
    const [lassoClipboard, setLassoClipboard] = useState<LassoClipboard | null>(null);
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

    const canvasFolderIdByCanvasId = useMemo(() => buildCanvasFolderIdByCanvasId(canvasFolders), [canvasFolders]);

    const unfiledCanvases = useMemo(() => (
        getUnfiledCanvases(canvasDocuments, canvasFolderIdByCanvasId)
    ), [canvasDocuments, canvasFolderIdByCanvasId]);

    const canvasFoldersByCategory = useMemo(() => (
        groupCanvasFoldersByCategory(canvasFolders)
    ), [canvasFolders]);

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

    const replaceFolder = (updated: CanvasFolder) => {
        setCanvasFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : folder)));
    };

    const flushCurrentCanvasSave = () => {
        if (selectedCanvasIdRef.current) handleFlushSaveRef.current();
    };

    const handleSelectCanvas = (canvasId: string) => {
        if (selectedCanvasIdRef.current !== canvasId) {
            flushCurrentCanvasSave();
        }
        setSelectedCanvasId(canvasId);
    };

    const handleCreateCanvas = async (folderId?: string) => {
        try {
            flushCurrentCanvasSave();
            const created = await createCanvasDocument(`새 캔버스_${Date.now()}`);
            setCanvasDocuments((prev) => [created, ...prev]);
            if (folderId) {
                const updatedFolder = await addCanvasToFolder(folderId, created.id);
                setCanvasFolders((prev) => prev.map((folder) => (folder.id === updatedFolder.id ? updatedFolder : {
                    ...folder,
                    canvasIds: folder.canvasIds.filter((canvasId) => canvasId !== created.id),
                })));
            }
            handleSelectCanvas(created.id);
        } catch (error) {
            console.error("Failed to create canvas:", error);
            setLibraryError("캔버스를 생성하는 중 오류가 발생했습니다.");
        }
    };

    const handleCreateFolder = async () => {
        if (!folderForm.name.trim()) return;
        try {
            const created = await createCanvasFolder(folderForm);
            setCanvasFolders((prev) => [created, ...prev]);
            setFolderForm(EMPTY_FOLDER_FORM);
        } catch (error) {
            console.error("Failed to create canvas folder:", error);
            setLibraryError("캔버스 폴더를 생성하는 중 오류가 발생했습니다.");
        }
    };

    const handleUpdateFolder = async (folderId: string) => {
        if (!editingFolderForm.name.trim()) return;
        try {
            const updated = await updateCanvasFolder(folderId, editingFolderForm);
            replaceFolder(updated);
            setEditingFolderId(null);
            setOpenFolderMenuId(null);
        } catch (error) {
            console.error("Failed to update canvas folder:", error);
            setLibraryError("캔버스 폴더를 수정하는 중 오류가 발생했습니다.");
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        try {
            await deleteCanvasFolder(folderId);
            setCanvasFolders((prev) => prev.filter((folder) => folder.id !== folderId));
            setOpenFolderMenuId(null);
        } catch (error) {
            console.error("Failed to delete canvas folder:", error);
            setLibraryError("캔버스 폴더를 삭제하는 중 오류가 발생했습니다.");
        }
    };

    const handleUpdateCanvasTitle = async (canvasId: string) => {
        const title = editingCanvasTitle.trim();
        if (!title) return;
        try {
            const updated = await updateCanvasDocument(canvasId, title);
            setCanvasDocuments((prev) => prev.map((document) => (document.id === canvasId ? updated : document)));
            setEditingCanvasId(null);
            setOpenCanvasMenuId(null);
        } catch (error) {
            console.error("Failed to update canvas title:", error);
            setLibraryError("캔버스 이름을 수정하는 중 오류가 발생했습니다.");
        }
    };

    const handleDeleteCanvas = async (canvasId: string) => {
        try {
            await deleteCanvasDocument(canvasId);
            setCanvasDocuments((prev) => {
                const next = prev.filter((document) => document.id !== canvasId);
                setSelectedCanvasId((current) => (current === canvasId ? next[0]?.id ?? null : current));
                return next;
            });
            setCanvasFolders((prev) => prev.map((folder) => ({
                ...folder,
                canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
            setOpenCanvasMenuId(null);
        } catch (error) {
            console.error("Failed to delete canvas:", error);
            setLibraryError("캔버스를 삭제하는 중 오류가 발생했습니다.");
        }
    };

    const handleDropOnFolder = async (event: DragEvent<HTMLDivElement>, folderId: string) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        if (!canvasId) return;
        try {
            const updated = await addCanvasToFolder(folderId, canvasId);
            setCanvasFolders((prev) => prev.map((folder) => (folder.id === updated.id ? updated : {
                ...folder,
                canvasIds: folder.canvasIds.filter((id) => id !== canvasId),
            })));
        } catch (error) {
            console.error("Failed to move canvas into folder:", error);
            setLibraryError("캔버스를 폴더로 이동하는 중 오류가 발생했습니다.");
        }
    };

    const handleDropOnUnfiled = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const canvasId = event.dataTransfer.getData("text/plain");
        const folderId = canvasFolderIdByCanvasId.get(canvasId);
        if (!canvasId || !folderId) return;
        try {
            const updated = await removeCanvasFromFolder(folderId, canvasId);
            replaceFolder(updated);
        } catch (error) {
            console.error("Failed to remove canvas from folder:", error);
            setLibraryError("캔버스를 폴더에서 빼는 중 오류가 발생했습니다.");
        }
    };

    const beginEditFolder = (folder: CanvasFolder) => {
        setEditingFolderId(folder.id);
        setEditingFolderForm({ category: folder.category, name: folder.name });
        setOpenFolderMenuId(null);
    };

    const beginEditCanvas = (document: CanvasDocumentSummary) => {
        setEditingCanvasId(document.id);
        setEditingCanvasTitle(document.title);
        setOpenCanvasMenuId(null);
    };

    const toggleFolderCollapsed = (folderId: string) => {
        setCollapsedFolderIds((current) => {
            const next = new Set(current);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
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

    const moveLassoSelection = (dx: number, dy: number) => {
        if (!lassoSelection) return;

        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, points: line.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) })
                : line
        )));
        setImages((prev) => prev.map((image) => (
            lassoSelection.imageIds.has(image.id)
                ? markModified({ ...image, x: image.x + dx, y: image.y + dy })
                : image
        )));
        setTextBoxes((prev) => prev.map((textBox) => (
            lassoSelection.textBoxIds.has(textBox.id)
                ? markModified({ ...textBox, x: textBox.x + dx, y: textBox.y + dy })
                : textBox
        )));
    };

    const handleScaleLassoSelection = (factor: number) => {
        if (!lassoSelection || !lassoBounds) return;
        recordHistory();

        const center = {
            x: (lassoBounds.minX + lassoBounds.maxX) / 2,
            y: (lassoBounds.minY + lassoBounds.maxY) / 2,
        };
        const scalePoint = (point: Point): Point => ({
            x: center.x + (point.x - center.x) * factor,
            y: center.y + (point.y - center.y) * factor,
        });

        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, points: line.points.map(scalePoint) })
                : line
        )));
        setImages((prev) => prev.map((image) => {
            if (!lassoSelection.imageIds.has(image.id)) return image;
            const topLeft = scalePoint({ x: image.x, y: image.y });
            return markModified({ ...image, x: topLeft.x, y: topLeft.y, width: image.width * factor, height: image.height * factor });
        }));
        setTextBoxes((prev) => prev.map((textBox) => {
            if (!lassoSelection.textBoxIds.has(textBox.id)) return textBox;
            const topLeft = scalePoint({ x: textBox.x, y: textBox.y });
            return markModified({ ...textBox, x: topLeft.x, y: topLeft.y, width: textBox.width * factor, height: textBox.height * factor });
        }));
    };

    const handleCopyLassoSelection = () => {
        if (!lassoSelection) return;

        setLassoClipboard({
            lines: drawnLines
                .filter((line) => line.status !== "deleted" && lassoSelection.lineIds.has(line.id))
                .map((line) => ({ ...line, points: line.points.map((point) => ({ ...point })) })),
            images: images
                .filter((image) => image.status !== "deleted" && lassoSelection.imageIds.has(image.id))
                .map((image) => ({ ...image })),
            textBoxes: textBoxes
                .filter((textBox) => textBox.status !== "deleted" && lassoSelection.textBoxIds.has(textBox.id))
                .map((textBox) => ({ ...textBox })),
        });
        lassoPasteCountRef.current = 0;
    };

    const handlePasteLassoSelection = () => {
        if (!lassoClipboard) return;
        recordHistory();

        lassoPasteCountRef.current += 1;
        const pasteOffset = LASSO_PASTE_OFFSET * lassoPasteCountRef.current;
        const nextLineIds = new Set<string>();
        const nextImageIds = new Set<string>();
        const nextTextBoxIds = new Set<string>();

        const pastedLines = lassoClipboard.lines.map((line) => {
            const id = uuidv4();
            nextLineIds.add(id);
            return {
                ...line,
                id,
                points: line.points.map((point) => ({ x: point.x + pasteOffset, y: point.y + pasteOffset })),
                status: "new" as const,
            };
        });
        const pastedImages = lassoClipboard.images.map((image) => {
            const id = uuidv4();
            nextImageIds.add(id);
            return {
                ...image,
                id,
                x: image.x + pasteOffset,
                y: image.y + pasteOffset,
                status: "new" as const,
            };
        });
        const pastedTextBoxes = lassoClipboard.textBoxes.map((textBox) => {
            const id = uuidv4();
            nextTextBoxIds.add(id);
            return {
                ...textBox,
                id,
                x: textBox.x + pasteOffset,
                y: textBox.y + pasteOffset,
                status: "new" as const,
            };
        });

        setDrawnLines((prev) => [...prev, ...pastedLines]);
        setImages((prev) => [...prev, ...pastedImages]);
        setTextBoxes((prev) => [...prev, ...pastedTextBoxes]);
        setLassoSelection({
            lineIds: nextLineIds,
            imageIds: nextImageIds,
            textBoxIds: nextTextBoxIds,
        });
        setTool("lasso");
    };

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

    const handleChangeLassoSelectionColor = (color: string) => {
        if (!lassoSelection) return;
        recordHistory();
        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, color })
                : line
        )));
        setTextBoxes((prev) => prev.map((textBox) => (
            lassoSelection.textBoxIds.has(textBox.id)
                ? markModified({ ...textBox, color })
                : textBox
        )));
        setImages((prev) => prev.map((image) => (
            lassoSelection.imageIds.has(image.id)
                ? markModified({ ...image, tintColor: color })
                : image
        )));
    };

    const handleDeleteLassoSelection = () => {
        if (!lassoSelection) return;
        recordHistory();
        setDrawnLines((prev) => prev.map((line) => (lassoSelection.lineIds.has(line.id) ? markModified({ ...line, status: "deleted" }) : line)));
        setImages((prev) => prev.map((image) => (lassoSelection.imageIds.has(image.id) ? markModified({ ...image, status: "deleted" }) : image)));
        setTextBoxes((prev) => prev.map((textBox) => (lassoSelection.textBoxIds.has(textBox.id) ? markModified({ ...textBox, status: "deleted" }) : textBox)));
        setLassoSelection(null);
    };

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
    const canvasCard = (document: CanvasDocumentSummary) => (
        <div
            key={document.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", document.id)}
            className={`mb-2 rounded-md border bg-white text-stone-900 shadow-sm transition ${
                selectedCanvasId === document.id ? "border-amber-500 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300"
            }`}
        >
            <div className="flex items-start gap-2 p-2">
                {editingCanvasId === document.id ? (
                    <input
                        className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs"
                        value={editingCanvasTitle}
                        onChange={(event) => setEditingCanvasTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void handleUpdateCanvasTitle(document.id);
                            if (event.key === "Escape") setEditingCanvasId(null);
                        }}
                        autoFocus
                    />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                        onClick={() => handleSelectCanvas(document.id)}
                    >
                        {document.title}
                    </button>
                )}
                {editingCanvasId === document.id ? (
                    <div className="flex shrink-0 gap-1">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateCanvasTitle(document.id)}>
                            <Check size={14} />
                        </button>
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingCanvasId(null)}>
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="relative shrink-0">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setOpenCanvasMenuId((current) => (current === document.id ? null : document.id))}>
                            <MoreVertical size={14} />
                        </button>
                        {openCanvasMenuId === document.id && (
                            <div className="absolute right-0 z-30 mt-1 w-28 overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-lg">
                                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => beginEditCanvas(document)}>
                                    <Pencil size={13} />
                                    수정
                                </button>
                                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => void handleDeleteCanvas(document.id)}>
                                    <Trash2 size={13} />
                                    삭제
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

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
                {!isCanvasLibraryVisible && (
                    <button
                        type="button"
                        data-canvas-touch-allow="true"
                        className="absolute left-0 top-4 z-40 inline-flex h-11 items-center gap-2 rounded-r-md border border-l-0 border-stone-300 bg-white px-3 text-sm font-bold text-stone-800 shadow-lg hover:bg-stone-900 hover:text-amber-50"
                        onClick={toggleCanvasLibraryVisible}
                        title="캔버스 폴더 펼치기"
                        aria-label="캔버스 폴더 펼치기"
                    >
                        <PanelLeftOpen size={18} />
                        <span className="hidden sm:inline">폴더</span>
                    </button>
                )}
                {isCanvasLibraryVisible && (
                    <aside
                        data-canvas-touch-allow="true"
                        className="absolute left-4 top-4 z-40 max-h-[calc(100%-2rem)] w-72 overflow-y-auto rounded-lg border border-stone-300 bg-stone-50 p-3 text-stone-900 shadow-xl"
                        onDragStart={(event) => event.stopPropagation()}
                    >
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase text-amber-700">Canvas Library</p>
                            <h2 className="text-base font-black">캔버스 폴더</h2>
                        </div>
                        <div className="flex shrink-0 gap-1">
                            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-800 hover:bg-stone-100" onClick={toggleCanvasLibraryVisible} title="캔버스 폴더 숨기기" aria-label="캔버스 폴더 숨기기">
                                <PanelLeftClose size={16} />
                            </button>
                            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-stone-900 text-white" onClick={() => void handleCreateCanvas()} title="캔버스 추가">
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="mb-3 grid gap-2">
                        <input className="rounded-md border border-stone-300 px-2 py-2 text-xs text-stone-900" value={folderForm.category} onChange={(event) => setFolderForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="카테고리" />
                        <div className="flex gap-2">
                            <input className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-2 text-xs text-stone-900" value={folderForm.name} onChange={(event) => setFolderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="폴더 이름" />
                            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-stone-900 text-white disabled:bg-stone-300" onClick={() => void handleCreateFolder()} disabled={!folderForm.name.trim()} title="폴더 추가">
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {libraryError && <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{libraryError}</p>}

                    <div className="space-y-3">
                        {Object.entries(canvasFoldersByCategory).map(([category, folders]) => (
                            <section key={category}>
                                <h3 className="mb-2 border-b border-stone-200 pb-1 text-[11px] font-bold uppercase text-stone-500">{category}</h3>
                                <div className="space-y-2">
                                    {folders.map((folder) => {
                                        const folderCanvasIds = new Set(folder.canvasIds);
                                        const folderCanvases = canvasDocuments.filter((document) => folderCanvasIds.has(document.id));
                                        const isEditing = editingFolderId === folder.id;
                                        const isCollapsed = collapsedFolderIds.has(folder.id);

                                        return (
                                            <div key={folder.id} className="rounded-lg border border-stone-200 bg-white p-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void handleDropOnFolder(event, folder.id)}>
                                                <div className="mb-2 flex items-start justify-between gap-2">
                                                    {isEditing ? (
                                                        <div className="grid min-w-0 flex-1 gap-1">
                                                            <input className="rounded-md border border-stone-300 px-2 py-1 text-xs" value={editingFolderForm.category} onChange={(event) => setEditingFolderForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="카테고리" />
                                                            <input className="rounded-md border border-stone-300 px-2 py-1 text-xs" value={editingFolderForm.name} onChange={(event) => setEditingFolderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="폴더 이름" />
                                                        </div>
                                                    ) : (
                                                        <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => toggleFolderCollapsed(folder.id)} title={isCollapsed ? "폴더 열기" : "폴더 접기"}>
                                                            {isCollapsed ? <ChevronRight size={15} className="shrink-0 text-stone-500" /> : <ChevronDown size={15} className="shrink-0 text-stone-500" />}
                                                            <Folder size={16} className="shrink-0 text-amber-600" />
                                                            <span className="truncate text-sm font-bold">{folder.name}</span>
                                                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">{folderCanvases.length}</span>
                                                        </button>
                                                    )}

                                                    {isEditing ? (
                                                        <div className="flex shrink-0 gap-1">
                                                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => void handleUpdateFolder(folder.id)}>
                                                                <Check size={14} />
                                                            </button>
                                                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setEditingFolderId(null)}>
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="relative shrink-0">
                                                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100" onClick={() => setOpenFolderMenuId((current) => (current === folder.id ? null : folder.id))}>
                                                                <MoreVertical size={14} />
                                                            </button>
                                                            {openFolderMenuId === folder.id && (
                                                                <div className="absolute right-0 z-30 mt-1 w-32 overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-lg">
                                                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => beginEditFolder(folder)}>
                                                                        <Pencil size={13} />
                                                                        수정
                                                                    </button>
                                                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-100" onClick={() => void handleCreateCanvas(folder.id)}>
                                                                        <Plus size={13} />
                                                                        캔버스 추가
                                                                    </button>
                                                                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => void handleDeleteFolder(folder.id)}>
                                                                        <Trash2 size={13} />
                                                                        삭제
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {!isCollapsed && (
                                                    <div className="min-h-14 rounded-md border border-dashed border-stone-200 bg-stone-50 p-2">
                                                        {folderCanvases.length > 0 ? folderCanvases.map(canvasCard) : <p className="py-3 text-center text-xs text-stone-500">캔버스를 드래그해서 넣으세요</p>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}

                        <section className="rounded-lg border border-dashed border-stone-300 bg-white p-2" onDragOver={(event) => event.preventDefault()} onDrop={handleDropOnUnfiled}>
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-stone-700">최근 캔버스</h3>
                                <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 hover:bg-stone-100" onClick={() => void handleCreateCanvas()} title="캔버스 추가">
                                    <Plus size={14} />
                                </button>
                            </div>
                            {unfiledCanvases.length > 0 ? unfiledCanvases.map(canvasCard) : <p className="py-4 text-center text-xs text-stone-500">폴더 밖 캔버스가 없습니다</p>}
                        </section>
                    </div>
                    </aside>
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
