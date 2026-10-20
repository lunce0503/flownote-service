import type { ToolType } from '@/entities/canvas';

export const APPLE_PENCIL_DOUBLE_TAP_EVENT = 'flownote:apple-pencil-double-tap';

export const nextApplePencilTool = (current: ToolType, previous: ToolType): { tool: ToolType; previous: ToolType } => ({
  tool: current === 'eraser' ? (previous === 'eraser' ? 'pen' : previous) : 'eraser',
  previous: current,
});
