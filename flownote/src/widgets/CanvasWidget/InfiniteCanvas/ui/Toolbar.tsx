import React from 'react';
import type { ToolType } from '../../../../entities/canvas/model/types';
import type { CanvasLoadTrigger, CanvasSaveState, CanvasSaveStatus } from '../../../../features/canvas/model/usePersistence';
import { CheckCircle2, ClipboardPaste, Copy, Download, Eraser, Hand, ImagePlus, Lasso, Loader2, Palette, PenLine, RefreshCw, RotateCcw, Settings, Trash2, TriangleAlert, Type, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';

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
  onClearLassoSelection,
  penColor,
  onPenColorChange,
  isCanvasSettingsVisible,
  onToggleCanvasSettingsVisible,
  zoomPercent,
  viewportCenter,
}) => {
  const touchStarts = React.useRef(new Map<number, { x: number; y: number }>());
  const lastTouchActivationAt = React.useRef(0);
  const toolButtons: Array<{ tool: ToolType; label: string; icon: React.ReactNode }> = [
    { tool: 'pen', label: '펜', icon: <PenLine size={18} /> },
    { tool: 'eraser', label: '지우개', icon: <Eraser size={18} /> },
    { tool: 'lasso', label: '올가미', icon: <Lasso size={18} /> },
    { tool: 'handle', label: '이동', icon: <Hand size={18} /> },
    { tool: 'text', label: '텍스트', icon: <Type size={18} /> },
  ];
  const touchActivation = (action: () => void) => ({
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
      className="pointer-events-none relative z-50 border-b border-stone-200 bg-stone-50 px-2 pt-2 text-stone-950 touch-pan-x touch-pan-y"
    >
      <div className="canvas-toolbar-scroll pointer-events-auto flex min-w-0 items-start justify-between gap-2 overflow-x-auto pb-2">
        <div className="flex min-w-max items-start gap-2">
          <div className="pointer-events-auto flex min-h-12 max-w-[220px] shrink-0 items-center rounded-full bg-white/95 px-4 text-sm font-black shadow-lg ring-1 ring-stone-200/80 backdrop-blur" title={canvasTitle}>
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
              <RotateCcw size={18} />
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
              <ImagePlus size={19} />
              <input className="sr-only" type="file" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2">
          <div className={floatingPillClass} title="현재 확대율과 화면 중앙 좌표">
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
                <RefreshCw size={18} />
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
                <X size={18} />
              </button>
            )}
            <button
              type="button"
              {...touchActivation(() => { void handleSave(); })}
              className={iconButtonClass}
              title="캔버스 저장"
            >
              <Download size={19} />
            </button>
            <button
              type="button"
              {...touchActivation(() => { void handleLoad(); })}
              className={iconButtonClass}
              title="캔버스 불러오기"
              disabled={saveState.status === 'loading'}
              aria-disabled={saveState.status === 'loading'}
            >
              <Upload size={19} />
            </button>
            {saveState.status === 'loading' && (
              <button
                type="button"
                {...touchActivation(cancelCanvasLoad)}
                className={iconButtonClass}
                title="캔버스 불러오기 취소"
                aria-label="캔버스 불러오기 취소"
              >
                <X size={18} />
              </button>
            )}
            <button
              type="button"
              {...touchActivation(onToggleCanvasSettingsVisible)}
              className={`${iconButtonClass} ${isCanvasSettingsVisible ? selectedIconButtonClass : ''}`}
              title="그림판 설정"
              aria-pressed={isCanvasSettingsVisible}
            >
              <Settings size={19} />
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-toolbar-scroll pointer-events-auto mt-2 flex items-start gap-3 overflow-x-auto pb-2">
        <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-full bg-white/95 p-2 shadow-lg ring-1 ring-stone-200/80 backdrop-blur">
          <div
            className="min-h-12 min-w-12 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: penColor }}
            title="현재 펜 색상"
          />
        </div>

        <div className="pointer-events-auto flex min-h-12 shrink-0 overflow-hidden rounded-full bg-white shadow-lg ring-1 ring-stone-200/80" title="펜 색상">
          {PEN_COLORS.map((color) => {
            const selected = penColor.toLowerCase() === color.value.toLowerCase();
            return (
              <button
                key={color.value}
                type="button"
                {...touchActivation(() => onPenColorChange(color.value))}
                className="relative flex min-h-12 min-w-12 shrink-0 items-center justify-center transition hover:brightness-95 active:brightness-90"
                style={{ backgroundColor: color.value }}
                title={`펜 색상: ${color.label}`}
                aria-label={`펜 색상 ${color.label}`}
                aria-pressed={selected}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {shouldShowLassoActions && (
        <div className="pointer-events-auto mt-3 flex w-fit items-center gap-1 rounded-full bg-white/95 px-2 py-1 shadow-lg ring-1 ring-stone-200/80 backdrop-blur" aria-label="선택 영역">
          {lassoSelectionCount > 0 && <span className="px-2 text-xs font-black text-stone-700">선택 {lassoSelectionCount}</span>}
          {lassoSelectionCount > 0 && (
            <>
              <button
                type="button"
                {...touchActivation(onCopyLassoSelection)}
                className={iconButtonClass}
                title="선택 영역 복사하기"
              >
                <Copy size={18} />
              </button>
              <button
                type="button"
                {...touchActivation(() => onScaleLassoSelection(0.88))}
                className={iconButtonClass}
                title="선택 영역 축소"
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                {...touchActivation(() => onScaleLassoSelection(1.12))}
                className={iconButtonClass}
                title="선택 영역 확대"
              >
                <ZoomIn size={18} />
              </button>
              <div className="flex min-h-12 items-center gap-1 rounded-full bg-stone-100 px-2" title="선택한 선, 이미지, 텍스트 색상 변경">
                <Palette size={16} className="text-stone-600" />
                {PEN_COLORS.map((color) => (
                  <button
                    key={`selection-${color.value}`}
                    type="button"
                    {...touchActivation(() => onChangeLassoSelectionColor(color.value))}
                    className="min-h-9 min-w-9 rounded-full border-2 border-white shadow-sm transition hover:scale-105"
                    style={{ backgroundColor: color.value }}
                    title={`선택 색상: ${color.label}`}
                    aria-label={`선택 색상 ${color.label}`}
                  />
                ))}
              </div>
              <button
                type="button"
                {...touchActivation(onDeleteLassoSelection)}
                className={`${iconButtonClass} bg-red-600 text-white hover:bg-red-700`}
                title="선택 영역 삭제"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                {...touchActivation(onClearLassoSelection)}
                className={iconButtonClass}
                title="선택 해제"
              >
                <X size={18} />
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
              <ClipboardPaste size={18} />
            </button>
          )}
        </div>
      )}
      {!canUndo && <span className="sr-only">되돌릴 작업이 없습니다.</span>}
    </div>
  );
};
