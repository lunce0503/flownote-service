type Point = { x: number; y: number };

type MomentumOptions = {
    getOffset: () => Point;
    setOffset: (point: Point) => void;
    requestFrame: (callback: (time: number) => void) => number;
    cancelFrame: (id: number) => void;
};

const MIN_SPEED = 0.5; // Viewport pixels per millisecond, independent of zoom.
const MAX_SPEED = 2.5;
const SAMPLE_WINDOW_MS = 80;
const STALE_SAMPLE_MS = 100;
const DURATION_MS = 320;

export const createCanvasPanMomentum = ({ getOffset, setOffset, requestFrame, cancelFrame }: MomentumOptions) => {
    let samples: { time: number; point: Point }[] = [];
    let frame: number | null = null;

    const stop = () => {
        if (frame !== null) cancelFrame(frame);
        frame = null;
        samples = [];
    };

    const begin = (time: number, point = getOffset()) => {
        stop();
        samples = [{ time, point: { ...point } }];
    };

    const track = (time: number, position = getOffset()) => {
        if (samples.length === 0) return;
        const point = { ...position };
        const last = samples[samples.length - 1];
        if (time <= last.time) {
            last.point = point;
            return;
        }
        // A reversal must use the new direction, not momentum from earlier in the drag.
        const first = samples[0];
        const delta = { x: point.x - last.point.x, y: point.y - last.point.y };
        if (delta.x * (last.point.x - first.point.x) + delta.y * (last.point.y - first.point.y) < 0) {
            samples = [last];
        }
        samples = samples.filter(sample => time - sample.time <= SAMPLE_WINDOW_MS);
        samples.push({ time, point });
    };

    const release = (time: number, reducedMotion = false) => {
        const first = samples[0];
        const last = samples[samples.length - 1];
        stop();
        if (reducedMotion || !first || !last || time - last.time >= STALE_SAMPLE_MS) return;
        const elapsed = time - first.time;
        if (elapsed <= 0) return;
        const velocity = {
            x: (last.point.x - first.point.x) / elapsed,
            y: (last.point.y - first.point.y) / elapsed,
        };
        const speed = Math.hypot(velocity.x, velocity.y);
        if (!Number.isFinite(speed) || speed < MIN_SPEED) return;
        const cap = Math.min(speed, MAX_SPEED) / speed;
        velocity.x *= cap;
        velocity.y *= cap;
        let previousTime = time;
        let previousDistance = 0;

        const advance = (now: number) => {
            frame = null;
            // Do not jump after a suspended tab or a long rendering stall.
            if (now - previousTime >= STALE_SAMPLE_MS) return;
            const elapsed = Math.min(DURATION_MS, Math.max(0, now - time));
            // Integral of linear deceleration from full speed to zero.
            const distance = elapsed - elapsed * elapsed / (2 * DURATION_MS);
            const delta = distance - previousDistance;
            const offset = getOffset();
            setOffset({ x: offset.x + velocity.x * delta, y: offset.y + velocity.y * delta });
            previousTime = now;
            previousDistance = distance;
            if (elapsed < DURATION_MS) frame = requestFrame(advance);
        };
        frame = requestFrame(advance);
    };

    return { begin, track, release, stop };
};
