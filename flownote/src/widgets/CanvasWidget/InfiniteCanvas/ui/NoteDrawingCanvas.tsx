import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
import { Eraser, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCanvasState } from "@/features/canvas";
import { useDrawing } from "@/features/canvas";
import { useElementManipulation } from "@/features/canvas";
import { useCanvasRendering } from "@/features/canvas";
import { useCanvasHistory } from "@/features/canvas";
import { CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY } from "@/features/canvas";
import type { LineElement, Point, ToolType } from "@/entities/canvas";
import { useLocalStorageBoolean } from "@/shared/lib/useLocalStorageBoolean";

type NoteDrawingCanvasProps = {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const NoteDrawingCanvas = ({ isSaving, onCancel, onSave }: NoteDrawingCanvasProps) => {
  const rendererRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointers = useRef<Map<number, Point>>(new Map());
  const [pencilOnlyMode, setPencilOnlyMode] = useLocalStorageBoolean(CANVAS_PENCIL_ONLY_MODE_STORAGE_KEY, true);

  const { offset, scale, tool, setTool, getCanvasCoords } = useCanvasState(canvasRef);
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
    eraseElementAtPointer,
  } = useElementManipulation(getCanvasCoords, tool);
  const {
    canUndo,
    recordHistory,
    undo,
  } = useCanvasHistory({
    lines: drawnLines,
    images,
    textBoxes,
    setDrawnLines,
    setImages,
    setTextBoxes,
  });
  const { redrawWith, redrawActiveStroke } = useCanvasRendering(
    rendererRef,
    offset,
    scale,
    currentLine.current,
    { color: "#000000", strokeWidth: 2 },
    { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  );

  useEffect(() => {
    redrawWith(drawnLines, images, textBoxes);
  }, [drawnLines, images, redrawWith, textBoxes]);

  const blocksTouchDrawing = (event: PointerEvent<HTMLCanvasElement>) => (
    pencilOnlyMode && event.pointerType === "touch" && (tool === "pen" || tool === "eraser")
  );

  const togglePencilOnlyMode = () => setPencilOnlyMode((current) => !current);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, pos);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (blocksTouchDrawing(event)) return;

    if (tool === "eraser") {
      recordHistory();
      eraseAtPointer(event);
      eraseElementAtPointer(event);
      return;
    }

    if (tool === "pen") {
      recordHistory();
      currentLine.current = [];
      appendPointerToCurrentLine(event);
      setIsDrawing(true);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (blocksTouchDrawing(event)) return;

    if (tool === "eraser") {
      eraseAtPointer(event);
      eraseElementAtPointer(event);
      return;
    }

    if (tool === "pen" && isDrawing) {
      appendPointerToCurrentLine(event);
      redrawActiveStroke();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!isDrawing) return;

    appendPointerToCurrentLine(event);
    const finishedLine = finishCurrentLine();

    if (finishedLine.length < 1) return;

    setDrawnLines((prev) => {
      const newLine: LineElement = {
        id: uuidv4(),
        points: finishedLine,
        status: "new",
      };
      return [...prev, newLine];
    });
  };

  const handleClear = () => {
    recordHistory();
    setDrawnLines([]);
    setImages([]);
    setTextBoxes([]);
    currentLine.current = [];
  };

  const handleExport = async () => {
    const renderedCanvas = rendererRef.current?.querySelector("canvas");
    if (!renderedCanvas) return;

    const output = document.createElement("canvas");
    output.width = renderedCanvas.width;
    output.height = renderedCanvas.height;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(renderedCanvas, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) return;

    await onSave(
      new File([blob], `drawing-note-${Date.now()}.png`, {
        type: "image/png",
      }),
    );
  };

  const toolButtons: Array<{ tool: ToolType; label: string; icon: ReactNode }> = [
    { tool: "pen", label: "펜", icon: <PenLine size={18} /> },
    { tool: "eraser", label: "지우개", icon: <Eraser size={18} /> },
  ];

  return (
    <div
      className="flex flex-col gap-3"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={togglePencilOnlyMode}
            className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
              pencilOnlyMode
                ? "bg-stone-900 text-white shadow-sm"
                : "bg-white text-stone-700 hover:bg-stone-200"
            }`}
            aria-pressed={pencilOnlyMode}
            title={pencilOnlyMode ? "애플펜슬 전용 켜짐" : "애플펜슬 전용 꺼짐"}
          >
            <PenLine size={18} />
            애플펜슬 전용
          </button>
          {toolButtons.map((item) => {
            const selected = tool === item.tool;
            return (
              <button
                key={item.tool}
                type="button"
                onClick={() => setTool(item.tool)}
                className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-stone-900 text-white shadow-sm"
                    : "bg-white text-stone-700 hover:bg-stone-200"
                }`}
                aria-pressed={selected}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:text-stone-300"
          >
            <RotateCcw size={18} />
            되돌리기
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
          >
            <Trash2 size={18} />
            전체 지우기
          </button>
        </div>
      </div>

      <div className="relative h-[58vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-stone-300 bg-white">
        <div ref={rendererRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="relative z-10 h-full w-full touch-none bg-transparent"
          style={{
            cursor: tool === "eraser" ? "cell" : "crosshair",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={isSaving}
          className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isSaving ? "저장 중..." : "노트에 추가"}
        </button>
      </div>
    </div>
  );
};

export default NoteDrawingCanvas;
