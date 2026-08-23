import { useRef, useState } from "react";
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
import { buildLassoSelection, isPointInsideBounds } from "@/features/canvas";

type EraserTargets = EraserElementTargets & { lines: boolean };

type UseCanvasPointerInputOptions = {
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
    const lastTouchDistanceRef = useRef<number | null>(null);
    const lastTouchCenterRef = useRef<Point | null>(null);
    const touchGestureActiveRef = useRef(false);
    const middleDragStartRef = useRef<Point | null>(null);
    const lassoDragStartRef = useRef<Point | null>(null);
    const [isMiddleDragging, setIsMiddleDragging] = useState(false);
    const [isLassoDragging, setIsLassoDragging] = useState(false);

    const blocksTouchDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => (
        pencilOnlyMode
        && event.pointerType === "touch"
        && (tool === "pen" || tool === "eraser" || tool === "lasso")
    );

    const resetActiveAction = () => {
        currentLineRef.current = [];
        resetLocalLine();
        setIsDrawing(false);
        setIsLassoDragging(false);
        lassoDragStartRef.current = null;
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
            const nextScale = Math.min(5, Math.max(0.2, previousScale * (newDistance / lastTouchDistanceRef.current)));
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

        lastTouchDistanceRef.current = newDistance;
        lastTouchCenterRef.current = newCenter;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
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
            middleDragStartRef.current = position;
            return;
        }

        if (event.pointerType === "touch" && pointersRef.current.size >= 2) {
            touchGestureActiveRef.current = true;
            resetActiveAction();
            updateTouchGestureBaseline();
            return;
        }

        if (touchGestureActiveRef.current || blocksTouchDrawing(event)) return;

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
            setIsDrawing(true);
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
            if (targetTextBox) beginTextBoxEdit(targetTextBox);
            else {
                if (editingTextBoxId) commitTextBoxEdit();
                createTextBoxAt(point);
            }
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const position = getCanvasViewportPoint(event.currentTarget, event.nativeEvent);

        if (isMiddleDragging && middleDragStartRef.current) {
            const nextOffset = {
                x: offsetRef.current.x + position.x - middleDragStartRef.current.x,
                y: offsetRef.current.y + position.y - middleDragStartRef.current.y,
            };
            offsetRef.current = nextOffset;
            setOffset(nextOffset);
            middleDragStartRef.current = position;
            return;
        }

        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.set(event.pointerId, position);

        if (touchGestureActiveRef.current && pointersRef.current.size >= 2) {
            moveViewportWithTouchGesture();
            return;
        }
        if (touchGestureActiveRef.current) return;

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
        } else if ((tool === "pen" || tool === "lasso") && isDrawing) {
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
        pointersRef.current.delete(event.pointerId);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (isMiddleDragging && event.button === 1) {
            setIsMiddleDragging(false);
            middleDragStartRef.current = null;
        }

        if (touchGestureActiveRef.current) {
            if (pointersRef.current.size >= 2) updateTouchGestureBaseline();
            else {
                lastTouchDistanceRef.current = null;
                lastTouchCenterRef.current = null;
            }
            if (pointersRef.current.size === 0) touchGestureActiveRef.current = false;
            return;
        }

        if (isLassoDragging) {
            setIsLassoDragging(false);
            lassoDragStartRef.current = null;
        } else if ((tool === "pen" || tool === "lasso") && isDrawing) {
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

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const previousScale = scaleRef.current;
        const nextScale = Math.min(5, Math.max(0.2, previousScale * factor));
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

    return { handlePointerDown, handlePointerMove, handlePointerUp, handleWheel, isMiddleDragging };
};
