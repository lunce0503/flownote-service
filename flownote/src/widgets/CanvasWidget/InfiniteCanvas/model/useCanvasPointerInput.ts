import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
    ImageElement,
    LineElement,
    Point,
    TextBoxElement,
    ToolType,
} from "@/entities/canvas";
import type {
    Bounds,
    EraserElementTargets,
    LassoSelection,
    MovingCanvasObject,
} from "@/features/canvas";
import { buildLassoSelection, isPointInsideBounds, MAX_CANVAS_SCALE, MIN_CANVAS_SCALE } from "@/features/canvas";
import { createCanvasPanMomentum } from "./canvasPanMomentum";

type EraserTargets = EraserElementTargets & { lines: boolean };
type PanAxis = "x" | "y";

type SingleTouchPan = {
    pointerId: number;
    origin: Point;
    previous: Point;
    axis: PanAxis | null;
};

const SINGLE_TOUCH_AXIS_LOCK_THRESHOLD = 6;

const resolvePanAxis = (origin: Point, current: Point): PanAxis | null => {
    const deltaX = current.x - origin.x;
    const deltaY = current.y - origin.y;
    if (Math.hypot(deltaX, deltaY) < SINGLE_TOUCH_AXIS_LOCK_THRESHOLD) return null;
    return Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
};

type UseCanvasPointerInputOptions = {
    canvasId: string | null;
    tool: ToolType;
    pencilOnlyMode: boolean;
    penColor: string;
    offsetRef: RefObject<Point>;
    scaleRef: RefObject<number>;
    setOffset: (offset: Point) => void;
    setScale: (scale: number) => void;
    getCanvasCoords: (event: React.PointerEvent | MouseEvent) => Point;
    isDrawing: boolean;
    setIsDrawing: Dispatch<SetStateAction<boolean>>;
    currentLineRef: RefObject<Point[]>;
    appendPointerToCurrentLine: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    finishCurrentLine: () => Point[];
    eraseAtPointer: (event: React.PointerEvent<HTMLCanvasElement>, enabled?: boolean) => void;
    drawnLines: LineElement[];
    setDrawnLines: Dispatch<SetStateAction<LineElement[]>>;
    images: ImageElement[];
    textBoxes: TextBoxElement[];
    movingObject: MovingCanvasObject | null;
    setMovingObject: Dispatch<SetStateAction<MovingCanvasObject | null>>;
    eraseElementAtPointer: (
        event: React.PointerEvent<HTMLCanvasElement>,
        targets: EraserElementTargets,
    ) => void;
    moveElement: (event: React.PointerEvent<HTMLCanvasElement>) => void;
    eraserTargets: EraserTargets;
    editingTextBoxId: string | null;
    commitTextBoxEdit: () => void;
    beginTextBoxEdit: (textBox: TextBoxElement) => void;
    createTextBoxAt: (point: Point) => void;
    lassoSelection: LassoSelection | null;
    setLassoSelection: Dispatch<SetStateAction<LassoSelection | null>>;
    lassoBounds: Bounds | null;
    moveLassoSelection: (deltaX: number, deltaY: number) => void;
    recordHistory: () => void;
    redrawActiveStroke: () => void;
    togglePenEraserTool: () => void;
    beginLocalLine: (line: Omit<LineElement, "status">, send: (line: Omit<LineElement, "status">) => void) => void;
    streamLocalPoints: (
        points: Point[],
        previousPointCount: number,
        send: (lineId: string, points: Point[]) => void,
    ) => void;
    finishLocalLine: (
        line: Omit<LineElement, "status">,
        send: (line: Omit<LineElement, "status">) => void,
    ) => Omit<LineElement, "status">;
    resetLocalLine: () => void;
    streamLineStart: (line: Omit<LineElement, "status">) => void;
    streamLinePoints: (lineId: string, points: Point[]) => void;
    streamLineEnd: (line: Omit<LineElement, "status">) => void;
    createLineId: () => string;
    strokeWidth: number;
};

const getCanvasViewportPoint = (
    canvas: HTMLCanvasElement,
    point: Pick<PointerEvent, "clientX" | "clientY">,
): Point => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (point.clientX - rect.left) * scaleX,
        y: (point.clientY - rect.top) * scaleY,
    };
};

export const useCanvasPointerInput = ({
    canvasId,
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
    createLineId,
    strokeWidth,
}: UseCanvasPointerInputOptions) => {
    const pointersRef = useRef<Map<number, Point>>(new Map());
    const isDrawingRef = useRef(isDrawing);
    const lastTouchDistanceRef = useRef<number | null>(null);
    const lastTouchCenterRef = useRef<Point | null>(null);
    const touchGestureActiveRef = useRef(false);
    const touchGestureStartScaleRef = useRef<number | null>(null);
    const singleTouchPanRef = useRef<SingleTouchPan | null>(null);
    const middleDragStartRef = useRef<{ pointerId: number; position: Point } | null>(null);
    const lassoDragStartRef = useRef<Point | null>(null);
    const [isMiddleDragging, setIsMiddleDragging] = useState(false);
    const [isLassoDragging, setIsLassoDragging] = useState(false);
    const momentumRef = useRef<ReturnType<typeof createCanvasPanMomentum> | null>(null);

    useEffect(() => {
        const momentum = createCanvasPanMomentum({
            getOffset: () => offsetRef.current,
            setOffset: (nextOffset) => {
                offsetRef.current = nextOffset;
                setOffset(nextOffset);
            },
            requestFrame: (callback) => window.requestAnimationFrame(callback),
            cancelFrame: (id) => window.cancelAnimationFrame(id),
        });
        momentumRef.current = momentum;
        const stop = () => momentum.stop();
        const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
        // Capture also stops coasting when the next interaction is outside the canvas.
        window.addEventListener("pointerdown", stop, true);
        window.addEventListener("wheel", stop, true);
        window.addEventListener("keydown", stop, true);
        window.addEventListener("blur", stop);
        window.addEventListener("flownote-preferences-change", stop);
        document.addEventListener("visibilitychange", stop);
        motionPreference.addEventListener("change", stop);
        return () => {
            momentum.stop();
            momentumRef.current = null;
            window.removeEventListener("pointerdown", stop, true);
            window.removeEventListener("wheel", stop, true);
            window.removeEventListener("keydown", stop, true);
            window.removeEventListener("blur", stop);
            window.removeEventListener("flownote-preferences-change", stop);
            document.removeEventListener("visibilitychange", stop);
            motionPreference.removeEventListener("change", stop);
        };
    }, [offsetRef, setOffset, tool, pencilOnlyMode, canvasId]);

    const releaseMomentum = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.type === "pointerup" && pointersRef.current.size === 0) {
            momentumRef.current?.release(performance.now(), window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("motion-reduced"));
        } else momentumRef.current?.stop();
    };

    const setDrawingActive = (active: boolean) => {
        isDrawingRef.current = active;
        setIsDrawing(active);
    };

    const blocksTouchDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => (
        pencilOnlyMode
        && event.pointerType === "touch"
        && (tool === "pen" || tool === "eraser" || tool === "lasso")
    );

    const resetActiveAction = () => {
        currentLineRef.current = [];
        resetLocalLine();
        setDrawingActive(false);
        setIsLassoDragging(false);
        lassoDragStartRef.current = null;
        singleTouchPanRef.current = null;
        setMovingObject(null);
    };

    const updateTouchGestureBaseline = () => {
        const touchPoints = Array.from(pointersRef.current.values()).slice(0, 2);
        if (touchPoints.length < 2) {
            lastTouchDistanceRef.current = null;
            lastTouchCenterRef.current = null;
            return;
        }

        const [first, second] = touchPoints;
        lastTouchDistanceRef.current = Math.hypot(first.x - second.x, first.y - second.y);
        lastTouchCenterRef.current = {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
        };
    };

    const moveViewportWithTouchGesture = () => {
        const touchPoints = Array.from(pointersRef.current.values()).slice(0, 2);
        if (touchPoints.length < 2) return;

        const [first, second] = touchPoints;
        const newDistance = Math.hypot(first.x - second.x, first.y - second.y);
        const newCenter = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const previousCenter = lastTouchCenterRef.current;

        if (lastTouchDistanceRef.current && previousCenter) {
            const previousScale = scaleRef.current;
            const nextScale = Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, previousScale * (newDistance / lastTouchDistanceRef.current)));
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
            // Track finger translation rather than intermediate pinch-induced offsets.
            momentumRef.current?.track(performance.now(), newCenter);
        }

        lastTouchDistanceRef.current = newDistance;
        lastTouchCenterRef.current = newCenter;
    };

    const moveViewportWithSingleTouch = (pointerId: number, position: Point) => {
        const gesture = singleTouchPanRef.current;
        if (!gesture || gesture.pointerId !== pointerId) return false;

        if (!gesture.axis) {
            gesture.axis = resolvePanAxis(gesture.origin, position);
            if (!gesture.axis) return true;
        }

        const deltaX = position.x - gesture.previous.x;
        const deltaY = position.y - gesture.previous.y;
        const previousOffset = offsetRef.current;
        const nextOffset = gesture.axis === "x"
            ? { x: previousOffset.x + deltaX, y: previousOffset.y }
            : { x: previousOffset.x, y: previousOffset.y + deltaY };

        gesture.previous = position;
        offsetRef.current = nextOffset;
        setOffset(nextOffset);
        momentumRef.current?.track(performance.now());
        return true;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        momentumRef.current?.stop();
        const position = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);
        pointersRef.current.set(event.pointerId, position);
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }

        const isPenAuxiliaryAction = event.pointerType === "pen"
            && (event.button !== 0 || (event.buttons & 2) === 2 || (event.buttons & 32) === 32);
        if (isPenAuxiliaryAction) {
            togglePenEraserTool();
            return;
        }

        if (event.pointerType === "mouse" && event.button === 1) {
            setIsMiddleDragging(true);
            middleDragStartRef.current = { pointerId: event.pointerId, position };
            momentumRef.current?.begin(performance.now());
            return;
        }

        if (event.pointerType === "touch" && pointersRef.current.size >= 2) {
            touchGestureActiveRef.current = true;
            touchGestureStartScaleRef.current = scaleRef.current;
            resetActiveAction();
            updateTouchGestureBaseline();
            momentumRef.current?.begin(performance.now(), lastTouchCenterRef.current ?? offsetRef.current);
            return;
        }

        if (touchGestureActiveRef.current) return;

        if (blocksTouchDrawing(event)) {
            singleTouchPanRef.current = {
                pointerId: event.pointerId,
                origin: position,
                previous: position,
                axis: null,
            };
            momentumRef.current?.begin(performance.now());
            return;
        }

        if (tool === "eraser") {
            if (editingTextBoxId) commitTextBoxEdit();
            setLassoSelection(null);
            recordHistory();
            eraseAtPointer(event, eraserTargets.lines);
            eraseElementAtPointer(event, {
                images: eraserTargets.images,
                textBoxes: eraserTargets.textBoxes,
            });
        } else if (tool === "pen") {
            if (editingTextBoxId) commitTextBoxEdit();
            setLassoSelection(null);
            recordHistory();
            const lineId = createLineId();
            currentLineRef.current = [];
            appendPointerToCurrentLine(event);
            beginLocalLine({
                id: lineId,
                points: currentLineRef.current.map((point) => ({ ...point })),
                color: penColor,
                strokeWidth,
            }, streamLineStart);
            setDrawingActive(true);
        } else if (tool === "lasso") {
            if (editingTextBoxId) commitTextBoxEdit();
            const point = getCanvasCoords(event);
            if (lassoSelection && isPointInsideBounds(point, lassoBounds)) {
                recordHistory();
                setIsLassoDragging(true);
                lassoDragStartRef.current = point;
                return;
            }
            recordHistory();
            currentLineRef.current = [];
            appendPointerToCurrentLine(event);
            setDrawingActive(true);
        } else if (tool === "handle") {
            setLassoSelection(null);
            setMovingObject(null);
            const { x, y } = getCanvasCoords(event);
            for (let index = images.length - 1; index >= 0; index -= 1) {
                const image = images[index];
                if (image.status !== "deleted" && x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height) {
                    if (editingTextBoxId) commitTextBoxEdit();
                    recordHistory();
                    setMovingObject({
                        type: "image",
                        index,
                        id: image.id,
                        status: image.status || "new",
                        grabOffset: { x: x - image.x, y: y - image.y },
                    });
                    return;
                }
            }
            for (let index = textBoxes.length - 1; index >= 0; index -= 1) {
                const textBox = textBoxes[index];
                if (textBox.status !== "deleted" && x >= textBox.x && x <= textBox.x + textBox.width && y >= textBox.y && y <= textBox.y + textBox.height) {
                    if (editingTextBoxId) commitTextBoxEdit();
                    recordHistory();
                    setMovingObject({
                        type: "text",
                        index,
                        id: textBox.id,
                        status: textBox.status || "new",
                        grabOffset: { x: x - textBox.x, y: y - textBox.y },
                    });
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
            if (targetTextBox) {
                if (editingTextBoxId && editingTextBoxId !== targetTextBox.id) commitTextBoxEdit();
                beginTextBoxEdit(targetTextBox);
            }
            else {
                if (editingTextBoxId) commitTextBoxEdit();
                createTextBoxAt(point);
            }
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const position = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);

        if (middleDragStartRef.current?.pointerId === event.pointerId) {
            const nextOffset = {
                x: offsetRef.current.x + position.x - middleDragStartRef.current.position.x,
                y: offsetRef.current.y + position.y - middleDragStartRef.current.position.y,
            };
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            middleDragStartRef.current.position = position;
            momentumRef.current?.track(performance.now());
            return;
        }

        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.set(event.pointerId, position);

        if (touchGestureActiveRef.current && pointersRef.current.size >= 2) {
            moveViewportWithTouchGesture();
            return;
        }
        if (touchGestureActiveRef.current) return;
        if (moveViewportWithSingleTouch(event.pointerId, position)) return;

        if (isLassoDragging && lassoDragStartRef.current) {
            const current = getCanvasCoords(event);
            moveLassoSelection(
                current.x - lassoDragStartRef.current.x,
                current.y - lassoDragStartRef.current.y,
            );
            lassoDragStartRef.current = current;
        } else if (blocksTouchDrawing(event)) {
            return;
        } else if (tool === "eraser") {
            eraseAtPointer(event, eraserTargets.lines);
            eraseElementAtPointer(event, {
                images: eraserTargets.images,
                textBoxes: eraserTargets.textBoxes,
            });
        } else if ((tool === "pen" || tool === "lasso") && isDrawingRef.current) {
            const previousPointCount = currentLineRef.current.length;
            appendPointerToCurrentLine(event);
            if (tool === "pen") {
                streamLocalPoints(currentLineRef.current, previousPointCount, streamLinePoints);
            }
            redrawActiveStroke();
        } else if (tool === "handle" && movingObject) {
            moveElement(event);
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        // A mouse can leave after pointerup has already removed it. Touch devices
        // emit an implicit leave on release, which must not cancel a normal flick.
        if (event.type === "pointerleave" && event.pointerType === "mouse") momentumRef.current?.stop();
        if (event.type === "pointercancel") momentumRef.current?.stop();
        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.delete(event.pointerId);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (middleDragStartRef.current?.pointerId === event.pointerId) {
            setIsMiddleDragging(false);
            middleDragStartRef.current = null;
            releaseMomentum(event);
            return;
        }

        if (singleTouchPanRef.current?.pointerId === event.pointerId) {
            releaseMomentum(event);
            singleTouchPanRef.current = null;
            setMovingObject(null);
            return;
        }

        if (touchGestureActiveRef.current) {
            if (event.type !== "pointerup") momentumRef.current?.stop();
            if (pointersRef.current.size >= 2) updateTouchGestureBaseline();
            else {
                lastTouchDistanceRef.current = null;
                lastTouchCenterRef.current = null;
            }
            if (pointersRef.current.size === 0) {
                touchGestureActiveRef.current = false;
                // Paired touch moves arrive separately. Compare the completed gesture's
                // scale rather than mistaking each intermediate distance change for a pinch.
                const startScale = touchGestureStartScaleRef.current;
                if (startScale !== null && Math.abs(scaleRef.current / startScale - 1) < 0.000001) {
                    releaseMomentum(event);
                } else momentumRef.current?.stop();
                touchGestureStartScaleRef.current = null;
            }
            return;
        }

        if (isLassoDragging) {
            setIsLassoDragging(false);
            lassoDragStartRef.current = null;
        } else if ((tool === "pen" || tool === "lasso") && isDrawingRef.current) {
            isDrawingRef.current = false;
            const previousPointCount = currentLineRef.current.length;
            appendPointerToCurrentLine(event);
            if (tool === "pen") {
                streamLocalPoints(currentLineRef.current, previousPointCount, streamLinePoints);
            }
            const finishedPoints = finishCurrentLine();
            if (tool === "lasso") {
                setLassoSelection(buildLassoSelection(finishedPoints, drawnLines, images, textBoxes));
            } else if (finishedPoints.length > 0) {
                const line = finishLocalLine({
                    id: createLineId(),
                    points: finishedPoints,
                    color: penColor,
                    strokeWidth,
                }, streamLineEnd);
                setDrawnLines((previous) => [...previous, { ...line, status: "new" }]);
            }
            resetLocalLine();
        }
        setMovingObject(null);
    };

    const handleLostPointerCapture = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (middleDragStartRef.current?.pointerId === event.pointerId
            || singleTouchPanRef.current?.pointerId === event.pointerId
            || touchGestureActiveRef.current) {
            handlePointerUp(event);
        }
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        momentumRef.current?.stop();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const previousScale = scaleRef.current;
        const nextScale = Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, previousScale * factor));
        const zoomRatio = nextScale / previousScale;
        if (zoomRatio === 1) return;

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

    return { handlePointerDown, handlePointerMove, handlePointerUp, handleLostPointerCapture, handleWheel, isMiddleDragging };
};
