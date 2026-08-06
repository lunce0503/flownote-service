// 일기장(diary) 도메인 타입.
// 백엔드(flownote-serve)는 todos/grid/journal 을 불투명 jsonb로 저장하므로 형태는 프론트가 정의한다.
// 응답 상위 키는 snake_case(entry_date/created_at)지만 jsonb 내부 키는 그대로 왕복된다(camelCase 유지).

export type DiaryTodo = {
  id: string;
  label: string;
  color: string;
  done: boolean;
};

// 그림판(캔버스) 기반 자유 필기 획. 좌표는 시간표 영역 기준 0~1 정규화 값이라
// 화면 크기가 달라져도(반응형) 같은 위치에 그려진다.
export type DiaryStroke = {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

// 시간표 그리드: startHour~endHour 를 행(시간)으로, 한 시간을 cols 칸으로 나눈다.
// cells 는 "슬롯 인덱스 → todoId" 매핑(칠해진 칸만 보관).
// strokes 는 오늘 하루에 직접 그린 필기(그림판 컴포넌트로 그린 내용)다.
export type DiaryGrid = {
  startHour: number;
  endHour: number;
  cols: number;
  cells: Record<string, string>;
  strokes: DiaryStroke[];
};

// BlockNote 문서 블록(에디터가 생성하므로 형태 검증 없이 왕복).
export type DiaryJournalBlock = unknown;

export type DiaryEntry = {
  id?: string;
  entry_date: string;
  todos: DiaryTodo[];
  grid: DiaryGrid;
  journal: DiaryJournalBlock[];
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_DIARY_GRID: DiaryGrid = {
  startHour: 6,
  endHour: 24,
  cols: 6,
  cells: {},
  strokes: [],
};

// 미리 지정된 할일 색상 팔레트(사용자는 색상 선택기로 커스텀도 가능).
export const DIARY_COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
] as const;

// 서버가 준 값이 부분적이거나 비어 있어도 안전한 그리드로 정규화한다.
export const normalizeDiaryGrid = (raw: unknown): DiaryGrid => {
  const source = (raw && typeof raw === "object") ? (raw as Partial<DiaryGrid>) : {};
  const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const cells = (source.cells && typeof source.cells === "object" && !Array.isArray(source.cells))
    ? (source.cells as Record<string, string>)
    : {};
  const strokes = Array.isArray(source.strokes)
    ? (source.strokes as DiaryStroke[]).filter((stroke) => (
      stroke && typeof stroke === "object" && Array.isArray(stroke.points) && stroke.points.length > 0
    ))
    : [];
  return {
    startHour: num(source.startHour, DEFAULT_DIARY_GRID.startHour),
    endHour: num(source.endHour, DEFAULT_DIARY_GRID.endHour),
    cols: Math.max(1, num(source.cols, DEFAULT_DIARY_GRID.cols)),
    cells: { ...cells },
    strokes,
  };
};
