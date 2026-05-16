import React from 'react';
import type { ToolType } from '../types/types';

interface ToolbarProps {
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSave: () => Promise<void>;
  handleLoad: () => Promise<void>;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  setTool,
  handleImageUpload,
  handleSave,
  handleLoad,
}) => {
  return (
    <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 10, display: 'flex', gap: '8px' }}>
      <button onClick={() => setTool('pen')}>Pen</button>
      <button onClick={() => setTool('eraser')}>Eraser</button>
      <button onClick={() => setTool('handle')}>Handle</button>
      <button onClick={() => setTool('text')}>Text</button>
      <label className="button-like-input" style={{ color: 'black' }}>
        <input type="file" accept="image/*" onChange={handleImageUpload}/>
      </label>
      <button onClick={handleSave}>Save</button>
      <button onClick={handleLoad}>Load</button>
      <span style={{ color: 'black' }}>Tool: {tool}</span>
    </div>
  );
};