export type ReaderLayout = 'single' | 'spread';
const clamp = (page: number, pages: number) => Math.min(Math.max(1, pages), Math.max(1, Math.trunc(page) || 1));
export function readerPages(page: number, pages: number, layout: ReaderLayout): number[] {
  const current = clamp(page, pages);
  const start = layout === 'spread' ? current - (current - 1) % 2 : current;
  return layout === 'spread' && start < pages ? [start, start + 1] : [start];
}
export function stepReaderPage(page: number, pages: number, layout: ReaderLayout, direction: number) {
  const start = readerPages(page, pages, layout)[0];
  const last = readerPages(pages, pages, layout)[0];
  return Math.min(last, Math.max(1, start + Math.sign(direction) * (layout === 'spread' ? 2 : 1)));
}
export function createWheelPager() {
  let total = 0, previous = -Infinity, latched = false;
  return {
    move(delta: number, now: number, eligible = true): number {
      if (now - previous > 180) { total = 0; latched = false; }
      previous = now;
      if (!Number.isFinite(delta) || !delta || latched) return 0;
      if (!eligible) { total = 0; return 0; }
      if (total && Math.sign(total) !== Math.sign(delta)) total = 0;
      total += delta;
      if (Math.abs(total) < 80) return 0;
      latched = true; return Math.sign(total);
    },
    isLatched(now: number) { return latched && now - previous <= 180; },
    reset() { total = 0; previous = -Infinity; latched = false; },
  };
}
export function swipePageDirection({ dx, dy, duration, contacts, zoom, selected }: {
  dx: number; dy: number; duration: number; contacts: number; zoom: number; selected: boolean;
}) {
  if (contacts !== 1 || zoom > 1 || selected || duration > 500 || duration < 30 || Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * .6) return 0;
  return dx < 0 ? 1 : -1;
}
