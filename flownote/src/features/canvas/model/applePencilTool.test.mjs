import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextApplePencilTool } from './applePencilTool.ts';

test('Apple Pencil double tap alternates the eraser and the previously selected canvas tool', () => {
  assert.deepEqual(nextApplePencilTool('pen', 'pen'), { tool: 'eraser', previous: 'pen' });
  assert.deepEqual(nextApplePencilTool('eraser', 'pen'), { tool: 'pen', previous: 'eraser' });
  assert.deepEqual(nextApplePencilTool('text', 'pen'), { tool: 'eraser', previous: 'text' });
  assert.deepEqual(nextApplePencilTool('eraser', 'text'), { tool: 'text', previous: 'eraser' });
});
