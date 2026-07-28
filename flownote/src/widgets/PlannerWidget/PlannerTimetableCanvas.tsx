import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { DiaryGrid, DiaryStroke, DiaryTodo } from "@/entities/diary";
import type { ScheduleItem } from "@/entities/schedule";
import type { DiaryTool } from "@/features/planner";
import { timeToMinutes } from "@/features/schedule";

type Props = {
  grid: DiaryGrid;
  todos: DiaryTodo[];
  /** 이 날짜에 해당하는 반복 일정. 시간표에 투명하게 겹쳐 보인다. */
  scheduleItems: ScheduleItem[];
  tool: DiaryTool;
  activeTodoId: string | null;
  penColor: string;
  onPaintCell: (slot: number) => void;
  onAddStroke: (stroke: DiaryStroke) => void;
};

const GUTTER_W = 44;
const CELL_H = 26;
const SCHEDULE_ALPHA = 0.22; // 반복 일정은 "임의 지정"한 참고용이라 투명하게 깔린다.
const STROKE_WIDTH = 2.5;
const MIN_POINT_DISTANCE = 0.0015; // 정규화 좌표 기준 최소 점 간격(과도한 점 저장 방지)

/**
 * 하루 시간표 캔버스.
 * - 배경: 주별로 임의 지정한 반복 일정(투명)
 * - 중간: 할일 색으로 칠한 칸
 * - 위: 그림판처럼 직접 그린 필기(오늘 새로 저장되는 내용)
 * 좌표는 정규화(0~1) 저장이라 화면 폭이 바뀌어도 위치가 유지된다.
 */
const PlannerTimetableCanvas = ({
  grid, todos, scheduleItems, tool, activeTodoId, penColor, onPaintCell, onAddStroke,
}: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const actionRef = useRef<"none" | "cell" | "draw">("none");
  const lastSlotRef = useRef<number | null>(null);
  const draftPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  const rows = Math.max(1, grid.endHour - grid.startHour);
  const cols = Math.max(1, grid.cols);
  const height = rows * CELL_H;

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    todos.forEach((todo) => map.set(todo.id, todo.color));
    return map;
  }, [todos]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
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
    const minutesPerRow = 60;
    const startMinutes = grid.startHour * 60;
    const totalMinutes = rows * minutesPerRow;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, GUTTER_W, height);

    // 1) 반복 일정 — 투명 레이어
    ctx.save();
    ctx.globalAlpha = SCHEDULE_ALPHA;
    scheduleItems.forEach((item) => {
      const start = timeToMinutes(item.start_time);
      const rawEnd = timeToMinutes(item.end_time);
      const end = rawEnd <= start ? start + (1440 - start) : rawEnd; // 자정 넘김은 그날 끝까지
      const top = ((start - startMinutes) / totalMinutes) * height;
      const bottom = ((end - startMinutes) / totalMinutes) * height;
      if (bottom <= 0 || top >= height) return;
      const y = Math.max(0, top);
      const blockHeight = Math.min(height, bottom) - y;
      ctx.fillStyle = item.color || "#0f766e";
      ctx.fillRect(GUTTER_W, y, gridW, blockHeight);
    });
    ctx.restore();

    // 반복 일정 제목(불투명하게 얇게 표기해 읽을 수 있게)
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "top";
    scheduleItems.forEach((item) => {
      const start = timeToMinutes(item.start_time);
      const top = ((start - startMinutes) / totalMinutes) * height;
      if (top < -12 || top > height) return;
      ctx.fillStyle = "#525252";
      ctx.fillText(`${item.start_time.slice(0, 5)} ${item.title}`, GUTTER_W + 4, Math.max(1, top + 2));
    });

    // 2) 할일 색으로 칠한 칸
    Object.entries(grid.cells).forEach(([slotKey, todoId]) => {
      const slot = Number(slotKey);
      if (!Number.isInteger(slot)) return;
      const color = colorById.get(todoId);
      if (!color) return; // 삭제된 할일의 잔여 칸은 그리지 않는다
      const row = Math.floor(slot / cols);
      const col = slot % cols;
      if (row < 0 || row >= rows || col < 0 || col >= cols) return;
      ctx.fillStyle = color;
      ctx.fillRect(GUTTER_W + col * cellW, row * CELL_H, cellW, CELL_H);
    });

    // 3) 격자 + 시간 라벨
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1;
    ctx.textBaseline = "middle";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    for (let row = 0; row <= rows; row += 1) {
      const y = Math.round(row * CELL_H) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (row < rows) {
        ctx.fillStyle = "#525252";
        ctx.fillText(`${String(grid.startHour + row).padStart(2, "0")}:00`, 5, row * CELL_H + CELL_H / 2);
      }
    }
    for (let col = 0; col <= cols; col += 1) {
      const x = Math.round(GUTTER_W + col * cellW) + 0.5;
      ctx.strokeStyle = col === 0 ? "#d4d4d4" : "#f0f0f0";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 4) 그림판 필기(정규화 좌표 → 화면 좌표)
    const renderStroke = (stroke: { color: string; width: number; points: Array<{ x: number; y: number }> }) => {
      if (stroke.points.length === 0) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const x = GUTTER_W + point.x * gridW;
        const y = point.y * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    grid.strokes.forEach(renderStroke);
    if (draftPointsRef.current.length > 0) {
      renderStroke({ color: penColor, width: STROKE_WIDTH, points: draftPointsRef.current });
    }
  }, [width, height, rows, cols, grid.cells, grid.strokes, grid.startHour, colorById, scheduleItems, penColor]);

  useEffect(() => { draw(); }, [draw]);

  const localPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const slotFrom = useCallback((point: { x: number; y: number }) => {
    const gridW = width - GUTTER_W;
    const cellW = gridW / cols;
    const x = point.x - GUTTER_W;
    if (x < 0 || point.y < 0) return null;
    const col = Math.floor(x / cellW);
    const row = Math.floor(point.y / CELL_H);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return row * cols + col;
  }, [width, cols, rows]);

  const normalized = useCallback((point: { x: number; y: number }) => ({
    x: (point.x - GUTTER_W) / (width - GUTTER_W),
    y: point.y / height,
  }), [width, height]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = localPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "draw") {
      actionRef.current = "draw";
      draftPointsRef.current = [normalized(point)];
      draw();
      return;
    }
    if (tool === "paint" && !activeTodoId) return;
    actionRef.current = "cell";
    lastSlotRef.current = null;
    const slot = slotFrom(point);
    if (slot !== null) {
      lastSlotRef.current = slot;
      onPaintCell(slot);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (actionRef.current === "none") return;
    event.preventDefault();
    const point = localPoint(event);
    if (!point) return;

    if (actionRef.current === "draw") {
      const next = normalized(point);
      const previous = draftPointsRef.current.at(-1);
      if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < MIN_POINT_DISTANCE) return;
      draftPointsRef.current.push(next);
      draw();
      return;
    }

    const slot = slotFrom(point);
    if (slot === null || slot === lastSlotRef.current) return;
    lastSlotRef.current = slot;
    onPaintCell(slot);
  };

  const stopAction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (actionRef.current === "draw" && draftPointsRef.current.length > 0) {
      onAddStroke({
        id: uuidv4(),
        color: penColor,
        width: STROKE_WIDTH,
        points: draftPointsRef.current,
      });
      draftPointsRef.current = [];
    }
    actionRef.current = "none";
    lastSlotRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const needsTodo = tool === "paint" && !activeTodoId;
  const cursor = needsTodo ? "not-allowed" : tool === "erase" ? "cell" : "crosshair";

  return (
    <div ref={containerRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopAction}
        onPointerCancel={stopAction}
        onPointerLeave={stopAction}
        className="block w-full touch-none rounded-lg border border-neutral-200 bg-white"
        style={{ cursor }}
      />
      {needsTodo && (
        <p className="mt-2 text-center text-xs text-neutral-500">
          칠할 할일을 먼저 추가하고 선택하세요. (필기는 펜 도구로 바로 가능)
        </p>
      )}
    </div>
  );
};

export default PlannerTimetableCanvas;
