import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasToolPointer, getCanvasPointerTool } from './canvasToolPointer.ts';

const bounds = { left: 10, top: 30, width: 300, height: 400 };
const event = (type, pointerType = 'pen', pointerId = 1, clientX = 70, clientY = 110) => (
    { type, pointerType, pointerId, clientX, clientY }
);

test('Pencil hover and contact show viewport coordinates without zoom or document changes', () => {
    const pointer = createCanvasToolPointer();
    assert.deepEqual(pointer.update(event('pointermove'), bounds), { x: 60, y: 80, pointerType: 'pen', contact: false });
    assert.deepEqual(pointer.update(event('pointerdown'), bounds), { x: 60, y: 80, pointerType: 'pen', contact: true });
    assert.equal(pointer.update(event('pointerup'), bounds), null);
    assert.deepEqual(pointer.update(event('pointermove'), bounds), { x: 60, y: 80, pointerType: 'pen', contact: false });
});

test('finger marker only appears during contact and mouse keeps its native cursor', () => {
    const pointer = createCanvasToolPointer();
    assert.equal(pointer.update(event('pointermove', 'touch'), bounds), null);
    assert.deepEqual(pointer.update(event('pointerdown', 'touch'), bounds), { x: 60, y: 80, pointerType: 'touch', contact: true });
    assert.equal(pointer.update(event('pointerup', 'touch'), bounds), null);
    assert.equal(pointer.update(event('pointermove', 'mouse'), bounds), null);
});

test('multitouch hides markers until every contact lifts, preserving pinch and palm handling', () => {
    const pointer = createCanvasToolPointer();
    pointer.update(event('pointerdown'), bounds);
    assert.equal(pointer.update(event('pointerdown', 'touch', 2), bounds), null);
    assert.equal(pointer.update(event('pointerup', 'touch', 2), bounds), null);
    assert.equal(pointer.update(event('pointermove'), bounds), null);
    pointer.update(event('pointerup'), bounds);
    assert.ok(pointer.update(event('pointermove'), bounds));
});

test('exit, cancellation, capture loss, reset and out-of-bounds input clear the marker', () => {
    for (const type of ['pointerleave', 'pointercancel', 'lostpointercapture']) {
        const pointer = createCanvasToolPointer();
        pointer.update(event('pointerdown', 'touch'), bounds);
        assert.equal(pointer.update(event(type, 'touch'), bounds), null);
        assert.equal(pointer.update(event('pointermove', 'touch'), bounds), null);
    }
    const pointer = createCanvasToolPointer();
    pointer.update(event('pointerdown', 'touch'), bounds);
    pointer.reset();
    assert.equal(pointer.update(event('pointermove', 'touch'), bounds), null);
    assert.equal(pointer.update(event('pointermove', 'pen', 1, 9, 110), bounds), null);
    assert.equal(pointer.update(event('pointermove', 'pen', 1, 70, 431), bounds), null);
});

test('tool markers distinguish all tools and show finger navigation in Pencil-only mode', () => {
    for (const tool of ['pen', 'eraser', 'lasso', 'handle', 'text']) {
        assert.equal(getCanvasPointerTool(tool, 'pen', true), tool);
        assert.equal(getCanvasPointerTool(tool, 'touch', false), tool);
    }
    for (const tool of ['pen', 'eraser', 'lasso']) {
        assert.equal(getCanvasPointerTool(tool, 'touch', true), 'pan');
    }
    assert.equal(getCanvasPointerTool('handle', 'touch', true), 'handle');
    assert.equal(getCanvasPointerTool('text', 'touch', true), 'text');
});
