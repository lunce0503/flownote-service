import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiaryGrid, DiaryTodo, DiaryJournalBlock } from "@/entities/diary";
import type { DiaryTool } from "@/features/diary";

type Props = {
  grid: DiaryGrid;
  todos: DiaryTodo[];
  tool: DiaryTool;
  activeTodoId: string | null;
  onPaintCell: (slot: number) => void;
};

const GUTTER_W = 46;
const CELL_H = 26;

// 캔버스로 그린 하루 시간표. 세로축은 시간(startHour~endHour), 한 시간을 cols칸으로 나눈다.
// 펜(활성 할일 색)으로 칸을 칠하고 지우개로 지운다. 칠해진 칸은 grid.cells[slot]=todoId 로 저장된다.
const DiaryTimetableCanvas = ({ grid, todos, tool, activeTodoId, onPaintCell }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const paintingRef = useRef(false);
  const lastSlotRef = useRef<number | null>(null);

  const rows = Math.max(1, grid.endHour - grid.startHour);
  const cols = Math.max(1, grid.cols);
  const height = rows * CELL_H;
  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    todos.forEach((todo) => map.set(todo.id, todo.color));
    return map;
  }, [todos]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gridW = width - GUTTER_W;
    const cellW = gridW / cols;

    ctx.clearRect(0, 0, width, height);
    // 배경
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, GUTTER_W, height);

    // 칠해진 칸
    for (const [slotKey, todoId] of Object.entries(grid.cells)) {
      const slot = Number(slotKey);
      if (!Number.isInteger(slot)) continue;
      const color = colorById.get(todoId);
      if (!color) continue; // 삭제된 할일 색은 건너뜀
      const row = Math.floor(slot / cols);
      const col = slot % cols;
      if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
      ctx.fillStyle = color;
      ctx.fillRect(GUTTER_W + col * cellW, row * CELL_H, cellW, CELL_H);
    }

    // 격자 + 시간 라벨
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let row = 0; row <= rows; row += 1) {
      const y = Math.round(row * CELL_H) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (row < rows) {
        const hour = grid.startHour + row;
        ctx.fillStyle = "#64748b";
        ctx.fillText(`${String(hour).padStart(2, "0")}:00`, 6, row * CELL_H + CELL_H / 2);
      }
    }
    for (let col = 0; col <= cols; col += 1) {
      const x = Math.round(GUTTER_W + col * cellW) + 0.5;
      ctx.strokeStyle = col === 0 ? "#cbd5e1" : "#eef2f7";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [width, height, rows, cols, grid.cells, grid.startHour, colorById]);

  useEffect(() => { draw(); }, [draw]);

  const slotFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const gridW = width - GUTTER_W;
    const cellW = gridW / cols;
    const x = event.clientX - rect.left - GUTTER_W;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0) return null;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / CELL_H);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return row * cols + col;
  }, [width, cols, rows]);

  const paintAt = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const slot = slotFromEvent(event);
    if (slot === null || slot === lastSlotRef.current) return;
    lastSlotRef.current = slot;
    onPaintCell(slot);
  }, [slotFromEvent, onPaintCell]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (tool === "paint" && !activeTodoId) return;
    paintingRef.current = true;
    lastSlotRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    paintAt(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    event.preventDefault();
    paintAt(event);
  };

  const stopPainting = (event: React.PointerEvent<HTMLCanvasElement>) => {
    paintingRef.current = false;
    lastSlotRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const disabled = tool === "paint" && !activeTodoId;

  return (
    <div ref={containerRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPainting}
        onPointerCancel={stopPainting}
        onPointerLeave={stopPainting}
        className="block w-full touch-none rounded-lg border border-slate-200 shadow-sm"
        style={{ cursor: disabled ? "not-allowed" : tool === "erase" ? "cell" : "crosshair" }}
      />
      {disabled && (
        <p className="mt-2 text-center text-xs text-slate-400">
          칠할 할일을 먼저 추가하고 선택하세요.
        </p>
      )}
    </div>
  );
};

export type { DiaryJournalBlock };
export default DiaryTimetableCanvas;
