import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasPointerAppearance, isMobileCanvasInput } from './canvasPointerAppearance.ts';

test('Android/iOS pen contact is hidden while supported hover remains a tiny circle', () => {
    for (const mobile of [isMobileCanvasInput('Android'), isMobileCanvasInput('iPad'), isMobileCanvasInput('Macintosh', 'MacIntel', 5)]) {
        assert.equal(mobile, true);
        assert.deepEqual(canvasPointerAppearance('pen', { pointerType: 'pen', contact: true }, mobile), { visible: false, diameter: 4 });
        assert.deepEqual(canvasPointerAppearance('pen', { pointerType: 'pen', contact: false }, mobile), { visible: true, diameter: 4 });
        assert.equal(canvasPointerAppearance('pen', { pointerType: 'touch', contact: true }, mobile).visible, false);
    }
    assert.equal(canvasPointerAppearance('pen', { pointerType: 'pen', contact: true }, false).visible, true);
});
test('eraser has a larger circle for mouse, touch and Pencil; navigation is separate', () => {
    for (const pointerType of ['mouse', 'pen', 'touch']) {
        assert.deepEqual(canvasPointerAppearance('eraser', { pointerType, contact: true }, true), { visible: true, diameter: 32 });
    }
    assert.equal(canvasPointerAppearance('pan', { pointerType: 'touch', contact: true }, true).visible, true);
    assert.equal(canvasPointerAppearance('pen', { pointerType: 'mouse', contact: false }, false).visible, false);
    assert.equal(canvasPointerAppearance('eraser', null, true).visible, false);
});
