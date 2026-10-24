import React from 'react';
import { BookOpen, CalendarDays } from 'lucide-react';
import type { ToolType } from '@/entities/canvas';
import type { CanvasLoadTrigger, CanvasSaveState, CanvasSaveStatus } from '@/features/canvas';
import { BringToFront, Check, CheckCircle2, ChevronDown, ClipboardPaste, Cloud, CloudUpload, Copy, Crosshair, Download, Eraser, Hand, ImagePlus, Lasso, LayoutGrid, Loader2, Maximize, Minimize, MoreVertical, Palette, PenLine, Pencil, RefreshCw, RotateCcw, SendToBack, Settings, Trash2, TriangleAlert, Type, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useFullscreen } from '@/shared/lib/useFullscreen';

interface ToolbarProps {
  canvasTitle: string;
  onNavigateToCanvasList: () => void;
  onRenameCanvas: (title: string) => Promise<void>;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  handleAssetUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isImportingAssets: boolean;
  assetImportMessage: string;
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
  onOpenPlannerSuggestions: () => void;
  onOpenPdfReader: () => void;
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

// 원형 아이콘 버튼 공통 크기. 장식용 Palette(16)는 스와치와 정렬을 맞추기 위해 작게 유지한다.
const TOOLBAR_ICON_SIZE = 18;

const floatingPillClass = 'pointer-events-auto flex min-h-12 shrink-0 items-center gap-1 rounded-full bg-white/95 px-2 shadow-lg ring-1 ring-stone-200/80 backdrop-blur';
const iconButtonClass = 'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full p-3 text-stone-950 transition hover:bg-stone-100 active:scale-95';
const selectedIconButtonClass = 'bg-stone-950 text-white hover:bg-stone-800';
const libraryButtonClass = `${iconButtonClass} bg-white/95 shadow-lg ring-1 ring-stone-200/80 backdrop-blur`;

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

const useTouchActivation = (): TouchActivation => {
  const touchStartsRef = React.useRef(new Map<number, { x: number; y: number }>());
  // No touch has occurred on mount: allow mouse/keyboard actions immediately.
  const lastTouchActivationAtRef = React.useRef(Number.NEGATIVE_INFINITY);

  return React.useCallback((action: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      event.stopPropagation();
      touchStartsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const start = touchStartsRef.current.get(event.pointerId);
      touchStartsRef.current.delete(event.pointerId);
      event.stopPropagation();
      if (!start) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > TOUCH_TAP_MAX_MOVEMENT) return;

      event.preventDefault();
      lastTouchActivationAtRef.current = performance.now();
      action();
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      touchStartsRef.current.delete(event.pointerId);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (performance.now() - lastTouchActivationAtRef.current < TOUCH_CLICK_SUPPRESSION_MS) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      action();
    },
  }), []);
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

interface PenColorPaletteProps {
  penColor: string;
  onPenColorChange: (color: string) => void;
  touchActivation: TouchActivation;
}

const PenColorPalette: React.FC<PenColorPaletteProps> = ({ penColor, onPenColorChange, touchActivation }) => {
  const isPenColorInPalette = PEN_COLORS.some((color) => color.value.toLowerCase() === penColor.toLowerCase());
  return (
    <div
      id="canvas-pen-color-palette"
      data-pen-palette="true"
      className={`${floatingPillClass} canvas-toolbar-scroll absolute left-1/2 top-[7.75rem] z-[60] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-x-auto lg:top-16`}
      role="dialog"
      aria-label="펜 색상 선택"
    >
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

interface CanvasTitleEditorProps {
  canvasTitle: string;
  onRenameCanvas: (title: string) => Promise<void>;
  className: string;
}

const CanvasTitleEditor: React.FC<CanvasTitleEditorProps> = ({ canvasTitle, onRenameCanvas, className }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(canvasTitle);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cancelEditing = () => {
    setDraftTitle(canvasTitle);
    setError(null);
    setIsEditing(false);
  };

  const saveTitle = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || isSaving) return;
    if (nextTitle === canvasTitle) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onRenameCanvas(nextTitle);
      setIsEditing(false);
    } catch (renameError) {
      console.error('Failed to rename canvas:', renameError);
      setError('제목을 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        className={`${className} gap-2 text-left`}
        onClick={() => { setDraftTitle(canvasTitle); setError(null); setIsEditing(true); }}
        title="캔버스 제목 편집"
        aria-label={`캔버스 제목 편집: ${canvasTitle}`}
      >
        <span className="min-w-0 flex-1 truncate">{canvasTitle}</span>
        <Pencil size={14} className="shrink-0 text-stone-500" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form
      className={`${className} gap-1 px-2`}
      onSubmit={(event) => { event.preventDefault(); void saveTitle(); }}
      title={error ?? '캔버스 제목 편집'}
    >
      <input
        className="h-8 min-w-0 flex-1 rounded-md border border-amber-400 bg-white px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
        value={draftTitle}
        onChange={(event) => setDraftTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') cancelEditing(); }}
        aria-label="캔버스 제목"
        maxLength={120}
        autoFocus
      />
      <button type="submit" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-stone-100 disabled:opacity-40" disabled={!draftTitle.trim() || isSaving} aria-label="제목 저장">
        {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
      <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-stone-100" onClick={cancelEditing} disabled={isSaving} aria-label="제목 편집 취소">
        <X size={15} />
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </form>
  );
};

export const Toolbar: React.FC<ToolbarProps> = ({
  canvasTitle,
  onNavigateToCanvasList,
  onRenameCanvas,
  tool,
  setTool,
  handleAssetUpload,
  isImportingAssets,
  assetImportMessage,
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
  onOpenPlannerSuggestions,
  onOpenPdfReader,
  zoomPercent,
  viewportCenter,
}) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [isFileMenuOpen, setIsFileMenuOpen] = React.useState(false);
  const [isMobileToolMenuOpen, setIsMobileToolMenuOpen] = React.useState(false);
  const [isPenPaletteOpen, setIsPenPaletteOpen] = React.useState(false);
  const fileMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const fileMenuRef = React.useRef<HTMLDivElement>(null);
  const mobileToolMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const mobileToolMenuRef = React.useRef<HTMLDivElement>(null);
  const touchActivation = useTouchActivation();
  const toolButtons: Array<{ tool: ToolType; label: string; icon: React.ReactNode }> = [
    { tool: 'pen', label: '펜', icon: <PenLine size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'eraser', label: '지우개', icon: <Eraser size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'lasso', label: '올가미', icon: <Lasso size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'handle', label: '이동', icon: <Hand size={TOOLBAR_ICON_SIZE} /> },
    { tool: 'text', label: '텍스트', icon: <Type size={TOOLBAR_ICON_SIZE} /> },
  ];
  const activeTool = toolButtons.find((item) => item.tool === tool) ?? toolButtons[0];
  const shouldShowLassoActions = lassoSelectionCount > 0 || (tool === 'lasso' && hasCopiedLassoSelection);
  const isSaveBusy = saveState.status === 'loading' || saveState.status === 'saving' || saveState.status === 'retrying';
  const canCancelRetry = saveState.status === 'retrying' || saveState.pendingRetries > 0;
  const saveStatusIcon = (() => {
    if (isSaveBusy) return <Loader2 size={TOOLBAR_ICON_SIZE} className="animate-spin" aria-hidden="true" />;
    if (saveState.status === 'failed') return <TriangleAlert size={TOOLBAR_ICON_SIZE} aria-hidden="true" />;
    if (saveState.status === 'saved') return <CheckCircle2 size={TOOLBAR_ICON_SIZE} aria-hidden="true" />;
    if (saveState.status === 'pending') return <CloudUpload size={TOOLBAR_ICON_SIZE} aria-hidden="true" />;
    return <Cloud size={TOOLBAR_ICON_SIZE} aria-hidden="true" />;
  })();
  const saveStatusLabel = saveState.pendingRetries > 0
    ? `${saveState.message} ${saveState.pendingRetries}`
    : saveState.message;

  const activateTool = (nextTool: ToolType) => {
    setIsMobileToolMenuOpen(false);
    if (nextTool === 'pen') {
      setTool('pen');
      setIsPenPaletteOpen((open) => tool === 'pen' ? !open : true);
      return;
    }
    setIsPenPaletteOpen(false);
    setTool(nextTool);
  };

  const selectPenColor = (color: string) => {
    onPenColorChange(color);
    setIsPenPaletteOpen(false);
  };

  const toggleMobileToolMenu = () => {
    setIsFileMenuOpen(false);
    setIsPenPaletteOpen(false);
    setIsMobileToolMenuOpen((open) => !open);
  };

  const handleMobileImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsMobileToolMenuOpen(false);
    void handleAssetUpload(event);
  };

  React.useEffect(() => {
    if (!isPenPaletteOpen) return;
    const closePalette = (event: Event) => {
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      const target = event.target;
      if (target instanceof Element && (target.closest('[data-pen-palette]') || target.closest('[data-pen-trigger]'))) return;
      setIsPenPaletteOpen(false);
    };
    document.addEventListener('keydown', closePalette);
    document.addEventListener('pointerdown', closePalette);
    return () => {
      document.removeEventListener('keydown', closePalette);
      document.removeEventListener('pointerdown', closePalette);
    };
  }, [isPenPaletteOpen]);

  React.useEffect(() => {
    if (!isMobileToolMenuOpen) return;
    const closeMenu = (restoreFocus: boolean) => {
      setIsMobileToolMenuOpen(false);
      if (restoreFocus) window.requestAnimationFrame(() => mobileToolMenuButtonRef.current?.focus());
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!mobileToolMenuRef.current?.contains(target) && !mobileToolMenuButtonRef.current?.contains(target)) {
        closeMenu(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMobileToolMenuOpen]);

  React.useEffect(() => {
    if (!isFileMenuOpen) return;
    window.requestAnimationFrame(() => fileMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus());
    const closeMenu = (restoreFocus: boolean) => {
      setIsFileMenuOpen(false);
      if (restoreFocus) window.requestAnimationFrame(() => fileMenuButtonRef.current?.focus());
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!fileMenuRef.current?.contains(target) && !fileMenuButtonRef.current?.contains(target)) {
        closeMenu(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isFileMenuOpen]);

  const handleFileMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    items[(currentIndex + offset + items.length) % items.length].focus();
  };

  const mobileMenuItemClass = 'flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      data-canvas-touch-allow="true"
      className="pointer-events-none absolute inset-x-2 top-2 z-50 flex flex-col items-center gap-2 text-stone-950 touch-pan-x touch-pan-y"
    >
      <div className="pointer-events-auto relative flex w-full items-center gap-2 p-1 lg:hidden">
        <button
          type="button"
          {...touchActivation(onNavigateToCanvasList)}
          data-testid="canvas-library-button"
          className={libraryButtonClass}
          aria-label="캔버스 목록으로"
        >
          <LayoutGrid size={TOOLBAR_ICON_SIZE} />
        </button>
        <CanvasTitleEditor canvasTitle={canvasTitle} onRenameCanvas={onRenameCanvas} className="flex min-h-12 min-w-0 flex-1 items-center rounded-full bg-white/95 px-4 text-sm font-black shadow-lg ring-1 ring-stone-200/80 backdrop-blur" />
        <div
          data-testid="canvas-save-status"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-lg ${saveStatusClassByStatus[saveState.status]}`}
          title={saveStatusLabel}
          role="status"
          aria-label={saveStatusLabel}
          aria-live="polite"
        >
          {saveStatusIcon}
          <span className="sr-only">{saveStatusLabel}</span>
        </div>
        <button
          ref={fileMenuButtonRef}
          type="button"
          {...touchActivation(() => setIsFileMenuOpen((open) => !open))}
          className={`${iconButtonClass} bg-white/95 shadow-lg ring-1 ring-stone-200/80 backdrop-blur`}
          aria-label="파일 동작"
          aria-haspopup="menu"
          aria-expanded={isFileMenuOpen}
        >
          <MoreVertical size={TOOLBAR_ICON_SIZE} />
        </button>

        {isFileMenuOpen && (
          <div ref={fileMenuRef} className="absolute right-1 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-xl ring-1 ring-stone-200" role="menu" onKeyDown={handleFileMenuKeyDown}>
            <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); onOpenPdfReader(); })}><BookOpen size={18} /> PDF 책 읽기</button>
            <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); onOpenPlannerSuggestions(); })}><CalendarDays size={18} /> 플래너 제안</button>
            {saveState.status === 'failed' && (
              <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); void retryPendingSaves(); })}>
                <RefreshCw size={18} /> 저장 재시도
              </button>
            )}
            {canCancelRetry && (
              <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); cancelPendingSaves(); })}>
                <X size={18} /> 저장 재시도 취소
              </button>
            )}
            <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); void handleSave(); })}>
              <Download size={18} /> 캔버스 저장
            </button>
            <button type="button" role="menuitem" className={mobileMenuItemClass} disabled={saveState.status === 'loading'} {...touchActivation(() => { setIsFileMenuOpen(false); void handleLoad(); })}>
              <Upload size={18} /> 캔버스 불러오기
            </button>
            {saveState.status === 'loading' && (
              <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); cancelCanvasLoad(); })}>
                <X size={18} /> 불러오기 취소
              </button>
            )}
            <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); void toggleFullscreen(); })}>
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              {isFullscreen ? '전체 화면 종료' : '전체 화면'}
            </button>
            <button type="button" role="menuitem" className={mobileMenuItemClass} {...touchActivation(() => { setIsFileMenuOpen(false); onToggleCanvasSettingsVisible(); })}>
              <Settings size={18} /> 캔버스 설정
            </button>
          </div>
        )}
      </div>

      <div className="canvas-toolbar-scroll pointer-events-auto flex w-max max-w-full overflow-x-auto p-1 lg:hidden" aria-label="그리기 도구">
        <div className={floatingPillClass}>
          <button
            type="button"
            {...touchActivation(handleUndo)}
            data-testid="canvas-undo-button"
            disabled={!canUndo}
            className={`${iconButtonClass} ${canUndo ? '' : 'disabled:cursor-not-allowed disabled:opacity-40'}`}
            aria-label="되돌리기"
          >
            <RotateCcw size={TOOLBAR_ICON_SIZE} />
          </button>
          <span
            data-testid="canvas-current-tool"
            className={`${iconButtonClass} ${selectedIconButtonClass} relative gap-2`}
            title={`현재 도구: ${activeTool.label}`}
            aria-label={`현재 도구: ${activeTool.label}`}
            role="status"
            aria-live="polite"
          >
            {activeTool.icon}
            <span className="whitespace-nowrap text-xs font-bold">{activeTool.label}</span>
            {activeTool.tool === 'pen' && (
              <span className="absolute bottom-1.5 h-2 w-2 rounded-full ring-1 ring-white/80" style={{ backgroundColor: penColor }} aria-hidden="true" />
            )}
          </span>
          <button
            ref={mobileToolMenuButtonRef}
            data-testid="canvas-tool-menu-toggle"
            type="button"
            {...touchActivation(toggleMobileToolMenu)}
            className={iconButtonClass}
            aria-label={isMobileToolMenuOpen ? '도구 접기' : '도구 펼치기'}
            aria-controls="canvas-mobile-tool-menu"
            aria-expanded={isMobileToolMenuOpen}
          >
            <ChevronDown size={TOOLBAR_ICON_SIZE} className={`transition-transform ${isMobileToolMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isMobileToolMenuOpen && (
        <div
          ref={mobileToolMenuRef}
          id="canvas-mobile-tool-menu"
          className={`${floatingPillClass} canvas-toolbar-scroll max-w-full overflow-x-auto lg:hidden`}
          role="group"
          aria-label="도구 선택"
        >
          {toolButtons.map((item) => {
            const selected = tool === item.tool;
            return (
              <button
                key={item.tool}
                type="button"
                {...touchActivation(() => activateTool(item.tool))}
                className={`${iconButtonClass} relative ${selected ? selectedIconButtonClass : ''}`}
                aria-label={item.label}
                aria-pressed={selected}
                {...(item.tool === 'pen' ? {
                  'data-pen-trigger': 'true',
                  'aria-controls': 'canvas-pen-color-palette',
                  'aria-expanded': isPenPaletteOpen,
                  'aria-haspopup': 'dialog' as const,
                } : {})}
              >
                {item.icon}
                {item.tool === 'pen' && (
                  <span className="absolute bottom-1.5 h-2 w-2 rounded-full ring-1 ring-white/80" style={{ backgroundColor: penColor }} aria-hidden="true" />
                )}
              </button>
            );
          })}
          <label className={`${iconButtonClass} ${isImportingAssets ? 'cursor-wait opacity-60' : 'cursor-pointer'}`} aria-label="이미지 또는 PDF 추가" title={assetImportMessage}>
            {isImportingAssets ? <Loader2 size={TOOLBAR_ICON_SIZE} className="animate-spin" /> : <ImagePlus size={TOOLBAR_ICON_SIZE} />}
            <input className="sr-only" type="file" accept="image/*,application/pdf" multiple onChange={handleMobileImageUpload} disabled={isImportingAssets} />
          </label>
        </div>
      )}

      {/* 폴더 패널처럼 캔버스 위에 떠 있는 플로팅 툴바 — 필 사이 빈 공간은 캔버스 입력을 통과시킨다. */}
      <div className="canvas-toolbar-scroll pointer-events-auto hidden w-max max-w-full items-start gap-2 overflow-x-auto p-1 lg:flex">
        <div className="flex min-w-max items-start gap-2">
          <button
            type="button"
            {...touchActivation(onNavigateToCanvasList)}
            data-testid="canvas-library-button"
            className={libraryButtonClass}
            title="캔버스 목록으로"
            aria-label="캔버스 목록으로"
          >
            <LayoutGrid size={TOOLBAR_ICON_SIZE} />
          </button>
          <button type="button" {...touchActivation(onOpenPlannerSuggestions)} className={libraryButtonClass} aria-label="플래너 제안" title="캔버스에서 플래너 제안"><CalendarDays size={TOOLBAR_ICON_SIZE} /></button>
          <button type="button" {...touchActivation(onOpenPdfReader)} className={libraryButtonClass} aria-label="PDF 책 읽기" title="PDF 책 읽기"><BookOpen size={TOOLBAR_ICON_SIZE} /></button>
          <CanvasTitleEditor canvasTitle={canvasTitle} onRenameCanvas={onRenameCanvas} className="pointer-events-auto flex min-h-12 max-w-[128px] shrink-0 items-center rounded-full bg-white/95 px-4 text-sm font-black shadow-lg ring-1 ring-stone-200/80 backdrop-blur sm:max-w-[220px] xl:max-w-xs" />

          <div className={floatingPillClass} aria-label="도구">
            <button
              type="button"
              {...touchActivation(handleUndo)}
              data-testid="canvas-undo-button"
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
                  {...touchActivation(() => activateTool(item.tool))}
                  className={`${iconButtonClass} relative ${selected ? selectedIconButtonClass : ''}`}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={selected}
                  {...(item.tool === 'pen' ? {
                    'data-pen-trigger': 'true',
                    'aria-controls': 'canvas-pen-color-palette',
                    'aria-expanded': isPenPaletteOpen,
                    'aria-haspopup': 'dialog' as const,
                  } : {})}
                >
                  {item.icon}
                  {item.tool === 'pen' && (
                    <span className="absolute bottom-1.5 h-2 w-2 rounded-full ring-1 ring-white/80" style={{ backgroundColor: penColor }} aria-hidden="true" />
                  )}
                </button>
              );
            })}
            <label className={`${iconButtonClass} ${isImportingAssets ? 'cursor-wait opacity-60' : 'cursor-pointer'}`} title={assetImportMessage} aria-label="이미지 또는 PDF 추가">
              {isImportingAssets ? <Loader2 size={TOOLBAR_ICON_SIZE} className="animate-spin" /> : <ImagePlus size={TOOLBAR_ICON_SIZE} />}
              <input className="sr-only" type="file" accept="image/*,application/pdf" multiple onChange={handleAssetUpload} disabled={isImportingAssets} />
            </label>
          </div>

        </div>

        <div className="flex shrink-0 items-start gap-2">
          <div className={floatingPillClass} aria-label="파일과 설정">
            <div
              data-testid="canvas-save-status"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${saveStatusClassByStatus[saveState.status]}`}
              title={saveStatusLabel}
              role="status"
              aria-label={saveStatusLabel}
              aria-live="polite"
            >
              {saveStatusIcon}
              <span className="sr-only">{saveStatusLabel}</span>
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
              title="캔버스 설정"
              aria-pressed={isCanvasSettingsVisible}
            >
              <Settings size={TOOLBAR_ICON_SIZE} />
            </button>
          </div>
        </div>
      </div>

      {isPenPaletteOpen && (
        <PenColorPalette penColor={penColor} onPenColorChange={selectPenColor} touchActivation={touchActivation} />
      )}

      <div
        data-testid="canvas-viewport-status"
        className="pointer-events-none fixed z-40 inline-flex min-h-10 items-center gap-2 rounded-full bg-white/95 px-3 text-xs font-black text-stone-800 shadow-lg ring-1 ring-stone-200/80 backdrop-blur"
        style={{ left: 'max(12px, env(safe-area-inset-left))', bottom: 'max(12px, env(safe-area-inset-bottom))' }}
        title="현재 확대율과 화면 중앙 좌표"
        aria-label={`확대율 ${zoomPercent}퍼센트, 화면 중앙 좌표 ${Math.round(viewportCenter.x)}, ${Math.round(viewportCenter.y)}`}
      >
        <ZoomIn size={16} aria-hidden="true" />
        <span>{zoomPercent}%</span>
        <span className="h-4 w-px bg-stone-200" aria-hidden="true" />
        <Crosshair size={16} aria-hidden="true" />
        <span>{Math.round(viewportCenter.x)}, {Math.round(viewportCenter.y)}</span>
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
