import React from 'react';
import type { ToolType } from '../../../../entities/canvas/model/types';
import { Eraser, FolderOpen, Hand, ImagePlus, PenLine, RotateCcw, Save, Type } from 'lucide-react';

interface ToolbarProps {
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSave: () => Promise<void>;
  handleLoad: () => Promise<void>;
  handleUndo: () => void;
  canUndo: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  setTool,
  handleImageUpload,
  handleSave,
  handleLoad,
  handleUndo,
  canUndo,
}) => {
  const toolButtons: Array<{ tool: ToolType; label: string; icon: React.ReactNode }> = [
    { tool: 'pen', label: 'Pen', icon: <PenLine size={18} /> },
    { tool: 'eraser', label: 'Eraser', icon: <Eraser size={18} /> },
    { tool: 'handle', label: 'Move', icon: <Hand size={18} /> },
    { tool: 'text', label: 'Text', icon: <Type size={18} /> },
  ];

  return (
    <div className="fixed left-4 top-20 z-20 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-100 p-2 text-stone-800 shadow-xl">
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
                  ? 'bg-stone-700 text-amber-50 shadow-md'
                  : 'bg-white text-stone-700 hover:bg-stone-700 hover:text-amber-50'
              }`}
              title={item.label}
              aria-pressed={selected}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-8 w-px bg-amber-300" />

      <label
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-stone-700 px-3 text-sm font-semibold text-amber-50 shadow-md hover:bg-stone-600"
        title="이미지 추가"
      >
        <ImagePlus size={18} />
        <span className="hidden sm:inline">Image</span>
        <input className="sr-only" type="file" accept="image/*" onChange={handleImageUpload}/>
      </label>
      <button
        type="button"
        onClick={handleUndo}
        disabled={!canUndo}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-stone-700 px-3 text-sm font-semibold text-amber-50 shadow-md hover:bg-stone-600 disabled:cursor-not-allowed disabled:bg-stone-400"
        title="되돌리기"
      >
        <RotateCcw size={18} />
        <span className="hidden sm:inline">Undo</span>
      </button>
      <button
        type="button"
        onClick={handleSave}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-stone-700 px-3 text-sm font-semibold text-amber-50 shadow-md hover:bg-stone-600"
        title="캔버스 저장"
      >
        <Save size={18} />
        <span className="hidden sm:inline">Save</span>
      </button>
      <button
        type="button"
        onClick={handleLoad}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-stone-700 px-3 text-sm font-semibold text-amber-50 shadow-md hover:bg-stone-600"
        title="캔버스 불러오기"
      >
        <FolderOpen size={18} />
        <span className="hidden sm:inline">Load</span>
      </button>
      <span className="rounded-md bg-white px-3 py-2 text-xs font-bold uppercase text-stone-600">
        {tool}
      </span>
    </div>
  );
};
