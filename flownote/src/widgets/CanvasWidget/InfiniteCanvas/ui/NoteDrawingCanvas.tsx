import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
import { Eraser, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCanvasState } from "../../../../features/canvas/model/useCanvasState";
import { useDrawing } from "../../../../features/canvas/model/useDrawing";
import { useElementManipulation } from "../../../../features/canvas/model/useElementManipulation";
import { useCanvasRendering } from "../../../../features/canvas/model/useCanvasRendering";
import { useCanvasHistory } from "../../../../features/canvas/model/useCanvasHistory";
import type { LineElement, Point, ToolType } from "../../../../entities/canvas/model/types";

type NoteDrawingCanvasProps = {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const NoteDrawingCanvas = ({ isSaving, onCancel, onSave }: NoteDrawingCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointers = useRef<Map<number, Point>>(new Map());

  const { offset, scale, tool, setTool, getCanvasCoords } = useCanvasState(canvasRef);
  const {
    isDrawing,
    setIsDrawing,
    drawnLines,
    setDrawnLines,
    currentLine,
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
  const { redrawWith } = useCanvasRendering(canvasRef, offset, scale, currentLine.current);

  useEffect(() => {
    redrawWith(drawnLines, images, textBoxes);
  }, [drawnLines, images, redrawWith, textBoxes]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, pos);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "eraser") {
      recordHistory();
      eraseAtPointer(event);
      eraseElementAtPointer(event);
      return;
    }

    if (tool === "pen") {
      recordHistory();
      const { x, y } = getCanvasCoords(event);
      currentLine.current = [{ x, y }];
      setIsDrawing(true);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (tool === "eraser") {
      eraseAtPointer(event);
      eraseElementAtPointer(event);
      return;
    }

    if (tool === "pen" && isDrawing) {
      const { x, y } = getCanvasCoords(event);
      currentLine.current.push({ x, y });
      redrawWith(drawnLines, images, textBoxes);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!isDrawing) return;

    setIsDrawing(false);
    const finishedLine = [...currentLine.current];
    currentLine.current = [];

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0);

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
        <div className="flex flex-wrap gap-1">
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

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="h-[58vh] min-h-[320px] w-full touch-none rounded-xl border border-stone-300 bg-white"
        style={{
          cursor: tool === "eraser" ? "cell" : "crosshair",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />

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
