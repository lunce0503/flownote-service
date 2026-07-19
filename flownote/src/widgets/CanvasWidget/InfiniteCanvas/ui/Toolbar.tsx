import React from 'react';
import type { ToolType } from '@/entities/canvas';
import type { CanvasLoadTrigger, CanvasSaveState, CanvasSaveStatus } from '@/features/canvas';
import { BringToFront, CheckCircle2, ClipboardPaste, Copy, Download, Eraser, Hand, ImagePlus, Lasso, Loader2, Maximize, Minimize, Palette, PenLine, RefreshCw, RotateCcw, SendToBack, Settings, Trash2, TriangleAlert, Type, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useFullscreen } from '@/shared/lib/useFullscreen';

interface ToolbarProps {
  canvasTitle: string;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSave: () => Promise<void>;
  handleLoad: (trigger?: CanvasLoadTrigger) => Promise<void>;
  cancelCanvasLoad: () => void;
  retryPendingSaves: () => Promise<void>;
  cancelPendingSaves: () => void;
  saveState: CanvasSaveState;
  handleUndo: () => void;
  canUndo: boolean;
  lassoSelectionCount: number;
  hasCopiedLassoSelection: boolean;
  onCopyLassoSelection: () => void;
  onPasteLassoSelection: () => void;
  onDeleteLassoSelection: () => void;
  onScaleLassoSelection: (factor: number) => void;
  onChangeLassoSelectionColor: (color: string) => void;
  onBringLassoSelectionToFront: () => void;
  onSendLassoSelectionToBack: () => void;
  onClearLassoSelection: () => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  isCanvasSettingsVisible: boolean;
  onToggleCanvasSettingsVisible: () => void;
  zoomPercent: number;
  viewportCenter: { x: number; y: number };
}

const PEN_COLORS = [
  { label: '검정', value: '#000000' },
  { label: '빨강', value: '#DC2626' },
  { label: '파랑', value: '#2563EB' },
  { label: '초록', value: '#16A34A' },
  { label: '노랑', value: '#D97706' },
  { label: '보라', value: '#7C3AED' },
];

// 원형 아이콘 버튼 공통 크기. 예외: 저장 상태 필 아이콘(14)은 text-xs 라벨과, 장식용 Palette(16)는 스와치와 정렬을 맞추기 위해 작게 유지한다.
const TOOLBAR_ICON_SIZE = 18;

const floatingPillClass = 'pointer-events-auto flex min-h-12 shrink-0 items-center gap-1 rounded-full bg-white/95 px-2 shadow-lg ring-1 ring-stone-200/80 backdrop-blur';
const iconButtonClass = 'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full p-3 text-stone-950 transition hover:bg-stone-100 active:scale-95';
const selectedIconButtonClass = 'bg-stone-950 text-white hover:bg-stone-800';

const saveStatusClassByStatus: Record<CanvasSaveStatus, string> = {
  idle: 'bg-stone-100 text-stone-600',
  loading: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  saving: 'bg-blue-100 text-blue-800',
  saved: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  retrying: 'bg-blue-100 text-blue-800',
};

const TOUCH_TAP_MAX_MOVEMENT = 10;
const TOUCH_CLICK_SUPPRESSION_MS = 700;

type TouchActivation = (action: () => void) => {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
};

interface ColorSwatchButtonProps {
  color: { label: string; value: string };
  selected?: boolean;
  onSelect: () => void;
  touchActivation: TouchActivation;
  titlePrefix: string;
}

const ColorSwatchButton: React.FC<ColorSwatchButtonProps> = ({ color, selected, onSelect, touchActivation, titlePrefix }) => (
  <button
    type="button"
    {...touchActivation(onSelect)}
    className="group inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95"
    title={`${titlePrefix}: ${color.label}`}
    aria-label={`${titlePrefix} ${color.label}`}
    aria-pressed={selected}
  >
    <span
      className={`rounded-full shadow-sm ring-offset-2 transition-all ${selected ? 'h-8 w-8 ring-2 ring-stone-950' : 'h-6 w-6 ring-1 ring-black/10 group-hover:h-7 group-hover:w-7'}`}
      style={{ backgroundColor: color.value }}
    />
  </button>
);

interface PenColorPillProps {
  penColor: string;
  onPenColorChange: (color: string) => void;
  touchActivation: TouchActivation;
}

const PenColorPill: React.FC<PenColorPillProps> = ({ penColor, onPenColorChange, touchActivation }) => {
  const isPenColorInPalette = PEN_COLORS.some((color) => color.value.toLowerCase() === penColor.toLowerCase());
  return (
    <div className={floatingPillClass} role="group" aria-label="펜 색상" title="펜 색상">
      <Palette size={16} className="ml-2 mr-1 shrink-0 text-stone-500" aria-hidden="true" />
      {!isPenColorInPalette && (
        <span className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center" title="현재 펜 색상">
          <span className="h-8 w-8 rounded-full shadow-sm ring-2 ring-stone-950 ring-offset-2" style={{ backgroundColor: penColor }} />
        </span>
      )}
      {PEN_COLORS.map((color) => (
        <ColorSwatchButton
          key={color.value}
          color={color}
          selected={penColor.toLowerCase() === color.value.toLowerCase()}
          onSelect={() => onPenColorChange(color.value)}
          touchActivation={touchActivation}
          titlePrefix="펜 색상"
        />
      ))}
    </div>
  );
};

export const Toolbar: React.FC<ToolbarProps> = ({
  canvasTitle,
  tool,
  setTool,
  handleImageUpload,
  handleSave,
  handleLoad,
  cancelCanvasLoad,
  retryPendingSaves,
  cancelPendingSaves,
  saveState,
  handleUndo,
  canUndo,
  lassoSelectionCount,
  hasCopiedLassoSelection,
  onCopyLassoSelection,
  onPasteLassoSelection,
  onDeleteLassoSelection,
  onScaleLassoSelection,
  onChangeLassoSelectionColor,
  onBringLassoSelectionToFront,
  onSendLassoSelectionToBack,
  onClearLassoSelection,
  penColor,
  onPenColorChange,
  isCanvasSettingsVisible,
  onToggleCanvasSettingsVisible,
  zoomPercent,
  viewportCenter,
}) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const touchStarts = React.useRef(new Map<number, { x: number; y: number }>());
  const lastTouchActivationAt = React.useRef(0);
  const toolButtons: Array<{ tool: ToolType; label: string; icon: React.ReactNode }> = [
    { tool: 'pen', label: '펜', icon: <PenLine size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'eraser', label: '지우개', icon: <Eraser size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'lasso', label: '올가미', icon: <Lasso size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'handle', label: '이동', icon: <Hand size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'text', label: '텍스트', icon: <Type size={TOOLBAR_ICON_SIZE} /> },
  ];
  const touchActivation: TouchActivation = (action: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      event.stopPropagation();
      touchStarts.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const start = touchStarts.current.get(event.pointerId);
      touchStarts.current.delete(event.pointerId);
      event.stopPropagation();
      if (!start) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > TOUCH_TAP_MAX_MOVEMENT) return;

      event.preventDefault();
      lastTouchActivationAt.current = performance.now();
      action();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      touchStarts.current.delete(event.pointerId);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (performance.now() - lastTouchActivationAt.current < TOUCH_CLICK_SUPPRESSION_MS) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      action();
    },
  });
  const shouldShowLassoActions = lassoSelectionCount > 0 || (tool === 'lasso' && hasCopiedLassoSelection);
  const isSaveBusy = saveState.status === 'loading' || saveState.status === 'saving' || saveState.status === 'retrying';
  const canCancelRetry = saveState.status === 'retrying' || saveState.pendingRetries > 0;
  const saveStatusIcon = (() => {
    if (isSaveBusy) return <Loader2 size={14} className="animate-spin" />;
    if (saveState.status === 'failed') return <TriangleAlert size={14} />;
    if (saveState.status === 'saved') return <CheckCircle2 size={14} />;
    return null;
  })();
  const saveStatusLabel = saveState.pendingRetries > 0
    ? `${saveState.message} ${saveState.pendingRetries}`
    : saveState.message;

  return (
    <div
      data-canvas-touch-allow="true"
      className="pointer-events-none absolute inset-x-2 top-2 z-50 flex flex-col items-center gap-2 text-stone-950 touch-pan-x touch-pan-y"
    >
      {/* 폴더 패널처럼 캔버스 위에 떠 있는 플로팅 툴바 — 필 사이 빈 공간은 캔버스 입력을 통과시킨다. */}
      <div className="canvas-toolbar-scroll pointer-events-auto flex w-max max-w-full items-start gap-2 overflow-x-auto p-1">
        <div className="flex min-w-max items-start gap-2">
          <div className="pointer-events-auto flex min-h-12 max-w-[128px] shrink-0 items-center rounded-full bg-white/95 px-4 text-sm font-black shadow-lg ring-1 ring-stone-200/80 backdrop-blur sm:max-w-[220px] xl:max-w-xs" title={canvasTitle}>
            <span className="truncate">{canvasTitle}</span>
          </div>

          <div className={floatingPillClass} aria-label="도구">
            <button
              type="button"
              {...touchActivation(handleUndo)}
              disabled={!canUndo}
              className={`${iconButtonClass} ${canUndo ? '' : 'disabled:cursor-not-allowed disabled:opacity-40'}`}
              title="되돌리기"
              aria-disabled={!canUndo}
            >
              <RotateCcw size={TOOLBAR_ICON_SIZE} />
            </button>
            {toolButtons.map((item) => {
              const selected = tool === item.tool;
              return (
                <button
                  key={item.tool}
                  type="button"
                  {...touchActivation(() => setTool(item.tool))}
                  className={`${iconButtonClass} ${selected ? selectedIconButtonClass : ''}`}
                  title={item.label}
                  aria-pressed={selected}
                >
                  {item.icon}
                </button>
              );
            })}
            <label className={`${iconButtonClass} cursor-pointer`} title="이미지 추가">
              <ImagePlus size={TOOLBAR_ICON_SIZE} />
              <input className="sr-only" type="file" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>

          {/* lg 이상에서는 펜 색상이 첫 줄에 합류해 툴바가 한 줄이 된다. 그 미만에서는 아래 두 번째 줄로 표시. */}
          <div className="hidden lg:flex">
            <PenColorPill penColor={penColor} onPenColorChange={onPenColorChange} touchActivation={touchActivation} />
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <div className="pointer-events-auto hidden min-h-12 shrink-0 items-center gap-1 rounded-full bg-white/95 px-2 shadow-lg ring-1 ring-stone-200/80 backdrop-blur sm:flex" title="현재 확대율과 화면 중앙 좌표">
            <span className="px-3 text-sm font-black">{zoomPercent}%</span>
            <span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-black">⌂ {Math.round(viewportCenter.x)}, {Math.round(viewportCenter.y)}</span>
          </div>

          <div className={floatingPillClass} aria-label="파일과 설정">
            <div
              className={`inline-flex min-h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black ${saveStatusClassByStatus[saveState.status]}`}
              title={saveStatusLabel}
              aria-live="polite"
            >
              {saveStatusIcon}
              <span className="max-w-[90px] truncate">{saveStatusLabel}</span>
            </div>
            {saveState.status === 'failed' && (
              <button
                type="button"
                {...touchActivation(() => { void retryPendingSaves(); })}
                className={iconButtonClass}
                title="저장 재시도"
              >
                <RefreshCw size={TOOLBAR_ICON_SIZE} />
              </button>
            )}
            {canCancelRetry && (
              <button
                type="button"
                {...touchActivation(cancelPendingSaves)}
                className={iconButtonClass}
                title="저장 재시도 취소"
                aria-label="저장 재시도 취소"
              >
                <X size={TOOLBAR_ICON_SIZE} />
              </button>
            )}
            <button
              type="button"
              {...touchActivation(() => { void handleSave(); })}
              className={iconButtonClass}
              title="캔버스 저장"
            >
              <Download size={TOOLBAR_ICON_SIZE} />
            </button>
            <button
              type="button"
              {...touchActivation(() => { void handleLoad(); })}
              className={iconButtonClass}
              title="캔버스 불러오기"
              disabled={saveState.status === 'loading'}
              aria-disabled={saveState.status === 'loading'}
            >
              <Upload size={TOOLBAR_ICON_SIZE} />
            </button>
            {saveState.status === 'loading' && (
              <button
                type="button"
                {...touchActivation(cancelCanvasLoad)}
                className={iconButtonClass}
                title="캔버스 불러오기 취소"
                aria-label="캔버스 불러오기 취소"
              >
                <X size={TOOLBAR_ICON_SIZE} />
              </button>
            )}
            <button
              type="button"
              {...touchActivation(() => { void toggleFullscreen(); })}
              className={`${iconButtonClass} ${isFullscreen ? selectedIconButtonClass : ''}`}
              title={isFullscreen ? '전체 화면 종료 (Esc)' : '전체 화면 (브라우저 툴바·헤더 숨김)'}
              aria-label={isFullscreen ? '전체 화면 종료' : '전체 화면'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? <Minimize size={TOOLBAR_ICON_SIZE} /> : <Maximize size={TOOLBAR_ICON_SIZE} />}
            </button>
            <button
              type="button"
              {...touchActivation(onToggleCanvasSettingsVisible)}
              className={`${iconButtonClass} ${isCanvasSettingsVisible ? selectedIconButtonClass : ''}`}
              title="그림판 설정"
              aria-pressed={isCanvasSettingsVisible}
            >
              <Settings size={TOOLBAR_ICON_SIZE} />
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-toolbar-scroll pointer-events-auto flex w-max max-w-full items-start gap-3 overflow-x-auto p-1 lg:hidden">
        <PenColorPill penColor={penColor} onPenColorChange={onPenColorChange} touchActivation={touchActivation} />
      </div>

      {/* 라쏘 액션 바는 툴바 행을 추가하는 대신 캔버스 위에 떠 있는 오버레이로 표시한다(라이브러리·설정 패널과 같은 z-40 층). */}
      {shouldShowLassoActions && (
        <div
          data-canvas-touch-allow="true"
          className="canvas-toolbar-scroll pointer-events-auto absolute left-1/2 top-full z-40 mt-2 flex w-max max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full bg-white/95 px-2 py-1 shadow-lg ring-1 ring-stone-200/80 backdrop-blur"
          aria-label="선택 영역"
        >
          {lassoSelectionCount > 0 && <span className="px-2 text-xs font-black text-stone-700">선택 {lassoSelectionCount}</span>}
          {lassoSelectionCount > 0 && (
            <>
              <button
                type="button"
                {...touchActivation(onCopyLassoSelection)}
                className={iconButtonClass}
                title="선택 영역 복사하기"
              >
                <Copy size={TOOLBAR_ICON_SIZE} />
              </button>
              <button
                type="button"
                {...touchActivation(() => onScaleLassoSelection(0.88))}
                className={iconButtonClass}
                title="선택 영역 축소"
              >
                <ZoomOut size={TOOLBAR_ICON_SIZE} />
              </button>
              <button
                type="button"
                {...touchActivation(() => onScaleLassoSelection(1.12))}
                className={iconButtonClass}
                title="선택 영역 확대"
              >
                <ZoomIn size={TOOLBAR_ICON_SIZE} />
              </button>
              <button
                type="button"
                {...touchActivation(onBringLassoSelectionToFront)}
                className={iconButtonClass}
                title="맨 앞으로 가져오기"
              >
                <BringToFront size={TOOLBAR_ICON_SIZE} />
              </button>
              <button
                type="button"
                {...touchActivation(onSendLassoSelectionToBack)}
                className={iconButtonClass}
                title="맨 뒤로 보내기"
              >
                <SendToBack size={TOOLBAR_ICON_SIZE} />
              </button>
              <div className="flex min-h-12 items-center gap-1 rounded-full bg-stone-100 px-2" title="선택한 선, 이미지, 텍스트 색상 변경">
                <Palette size={16} className="text-stone-600" />
                {PEN_COLORS.map((color) => (
                  <ColorSwatchButton
                    key={`selection-${color.value}`}
                    color={color}
                    onSelect={() => onChangeLassoSelectionColor(color.value)}
                    touchActivation={touchActivation}
                    titlePrefix="선택 색상"
                  />
                ))}
              </div>
              <button
                type="button"
                {...touchActivation(onDeleteLassoSelection)}
                className={`${iconButtonClass} bg-red-600 text-white hover:bg-red-700`}
                title="선택 영역 삭제"
              >
                <Trash2 size={TOOLBAR_ICON_SIZE} />
              </button>
              <button
                type="button"
                {...touchActivation(onClearLassoSelection)}
                className={iconButtonClass}
                title="선택 해제"
              >
                <X size={TOOLBAR_ICON_SIZE} />
              </button>
            </>
          )}
          {hasCopiedLassoSelection && (
            <button
              type="button"
              {...touchActivation(onPasteLassoSelection)}
              className={iconButtonClass}
              title="복사한 선택 영역 붙여넣기"
            >
              <ClipboardPaste size={TOOLBAR_ICON_SIZE} />
            </button>
          )}
        </div>
      )}
      {!canUndo && <span className="sr-only">되돌릴 작업이 없습니다.</span>}
    </div>
  );
};
