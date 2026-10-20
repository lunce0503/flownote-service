import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasPanMomentum } from './canvasPanMomentum.ts';

const harness = () => {
    let offset = { x: 0, y: 0 };
    let frameId = 0;
    const frames = new Map();
    const momentum = createCanvasPanMomentum({
        getOffset: () => offset,
        setOffset: next => { offset = next; },
        requestFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelFrame: id => frames.delete(id),
    });
    return {
        momentum,
        get offset() { return offset; },
        get pendingFrames() { return frames.size; },
        setOffset(point) { offset = point; },
        move(time, point) { offset = point; momentum.track(time); },
        tick(time) {
            const pending = [...frames.values()];
            frames.clear();
            pending.forEach(callback => callback(time));
        },
    };
};

test('fast pan continues in the last direction, decelerates, and stops within 320ms', () => {
    const h = harness();
    h.momentum.begin(0);
    h.move(20, { x: 20, y: -10 });
    h.move(40, { x: 40, y: -20 });
    h.momentum.release(40);
    h.tick(60);
    const first = h.offset;
    assert.ok(first.x > 40, 'a fast release must continue moving');
    assert.ok(first.y < -20);
    h.tick(80);
    assert.ok(h.offset.x - first.x < first.x - 40, 'successive equal frames must decelerate');
    for (let time = 100; time <= 360; time += 20) h.tick(time);
    assert.equal(h.pendingFrames, 0);
    const settled = h.offset;
    h.tick(1000);
    assert.deepEqual(h.offset, settled);
});

test('slow, paused, stationary, or reduced-motion releases stop immediately', () => {
    for (const [point, releaseTime, reducedMotion] of [
        [{ x: 4, y: 0 }, 20, false],
        [{ x: 30, y: 0 }, 140, false],
        [{ x: 0, y: 0 }, 20, false],
        [{ x: 30, y: 0 }, 20, true],
    ]) {
        const h = harness();
        h.momentum.begin(0);
        h.move(20, point);
        h.momentum.release(releaseTime, reducedMotion);
        h.tick(releaseTime + 16);
        assert.deepEqual(h.offset, point);
        assert.equal(h.pendingFrames, 0);
    }
});

test('axis-locked pan keeps its other coordinate fixed', () => {
    for (const point of [{ x: 24, y: 0 }, { x: 0, y: -24 }]) {
        const h = harness();
        h.momentum.begin(0);
        h.move(20, point);
        h.momentum.release(20);
        h.tick(40);
        assert.equal(point.x === 0 ? h.offset.x : h.offset.y, 0);
        assert.ok(Math.hypot(h.offset.x, h.offset.y) > 24);
    }
});

test('stop cancels pending motion and a new gesture never inherits velocity', () => {
    const h = harness();
    h.momentum.begin(0);
    h.move(20, { x: 30, y: 0 });
    h.momentum.release(20);
    h.momentum.stop();
    h.tick(40);
    assert.deepEqual(h.offset, { x: 30, y: 0 });
    assert.equal(h.pendingFrames, 0);
    h.momentum.begin(50);
    h.momentum.release(60);
    h.tick(80);
    assert.deepEqual(h.offset, { x: 30, y: 0 });
});

test('velocity follows a recent direction reversal rather than the whole drag', () => {
    const h = harness();
    h.momentum.begin(0);
    h.move(100, { x: 100, y: 0 });
    h.move(140, { x: 60, y: 0 });
    h.momentum.release(140);
    h.tick(160);
    assert.ok(h.offset.x < 60);
});

test('extreme flick speed is bounded and long frame suspension cannot cause a jump', () => {
    const h = harness();
    h.momentum.begin(0);
    h.move(1, { x: 1000, y: 1000 });
    h.momentum.release(1);
    for (let time = 17; time <= 321; time += 16) h.tick(time);
    assert.ok(Math.hypot(h.offset.x - 1000, h.offset.y - 1000) <= 400.001);
    assert.equal(h.pendingFrames, 0);
    h.momentum.begin(400);
    h.move(420, { x: 2000, y: 2000 });
    h.momentum.release(420);
    h.tick(2000);
    assert.deepEqual(h.offset, { x: 2000, y: 2000 });
    assert.equal(h.pendingFrames, 0);
});

test('duplicate timestamps do not produce infinite velocity or momentum', () => {
    const h = harness();
    h.momentum.begin(20);
    h.move(20, { x: 30, y: 0 });
    h.momentum.release(20);
    h.tick(40);
    assert.deepEqual(h.offset, { x: 30, y: 0 });
    assert.equal(h.pendingFrames, 0);
});

test('release delay reduces speed and a stopped gesture does not coast', () => {
    const h = harness();
    h.momentum.begin(0);
    h.move(20, { x: 20, y: 0 });
    h.move(80, { x: 20, y: 0 });
    h.momentum.release(80);
    h.tick(100);
    assert.deepEqual(h.offset, { x: 20, y: 0 });
    assert.equal(h.pendingFrames, 0);
});

test('equal elapsed time gives the same displacement at different frame rates', () => {
    const run = step => {
        const h = harness();
        h.momentum.begin(0);
        h.move(20, { x: 20, y: 0 });
        h.momentum.release(20);
        for (let elapsed = step; elapsed <= 320; elapsed += step) h.tick(20 + elapsed);
        return h.offset.x;
    };
    assert.ok(Math.abs(run(8) - run(32)) < 0.000001);
    assert.equal(run(32), 180);
});

test('two-finger velocity can use its center independently of intermediate pinch offsets', () => {
    const h = harness();
    h.momentum.begin(0, { x: 200, y: 200 });
    h.setOffset({ x: -100, y: -100 });
    h.momentum.track(20, { x: 220, y: 210 });
    h.setOffset({ x: 40, y: 20 });
    h.momentum.track(40, { x: 240, y: 220 });
    h.momentum.release(40);
    h.tick(60);
    assert.ok(h.offset.x > 40);
    assert.ok(h.offset.y > 20);
});
