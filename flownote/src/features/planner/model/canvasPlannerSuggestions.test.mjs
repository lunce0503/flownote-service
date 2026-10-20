import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCanvasPlans, addSuggestedSchedule } from './canvasPlannerSuggestions.ts';

const today = new Date(2026, 9, 6);
test('canvas title is the first candidate and its written time fills the timetable', () => {
  const items = suggestCanvasPlans([{ id: 'box', text: '다른 할 일\n2026-12-17 14:00~15:00 팀 회의' }], today, '2026-12-17 14:00~15:00 팀 회의');
  assert.equal(items.length, 2, 'duplicate body candidate is excluded');
  assert.deepEqual(items[0], { id: 'canvas-title:0', kind: 'schedule', title: '팀 회의', date: '2026-12-17', startTime: '14:00', endTime: '15:00' });
  const entry = { todos: [], journal: [], grid: { startHour: 0, endHour: 24, cols: 12, cells: {}, strokes: [] } };
  const next = addSuggestedSchedule(entry, items[0], 'title-schedule');
  assert.equal(next.todos[0].label, '팀 회의');
  assert.equal(next.grid.cells['168'], 'title-schedule');
  assert.equal(Object.keys(next.grid.cells).length, 12);
});
test('blank canvas names fall back to body text and title-only canvases produce a task', () => {
  assert.equal(suggestCanvasPlans([{ id: 'a', text: '본문 작업' }], today, '  ')[0].title, '본문 작업');
  assert.equal(suggestCanvasPlans([], today, '연구 계획')[0].title, '연구 계획');
});
test('extracts tasks, dates and timed schedules from canvas text', () => {
  const items = suggestCanvasPlans([{ id: 'box', text: '- [ ] 내일 보고서 제출\n2026-10-08 14:00~15:30 팀 회의\n오늘 할 일', status: 'unchanged' }], today);
  assert.equal(items.length, 3);
  assert.equal(items[0].date, '2026-10-07');
  assert.equal(items[0].title, '보고서 제출');
  assert.deepEqual(items[1], { id: 'box:1', kind: 'schedule', title: '팀 회의', date: '2026-10-08', startTime: '14:00', endTime: '15:30' });
});
test('skips deleted and completed text and deduplicates candidates', () => {
  const items = suggestCanvasPlans([{ id: 'a', text: '할 일\n할 일\n- [x] 완료된 일' }, { id: 'b', text: '삭제된 일', status: 'deleted' }], today);
  assert.equal(items.length, 1);
});
test('does not turn invalid dates or backward time ranges into schedules', () => {
  const items = suggestCanvasPlans([{ id: 'a', text: '2026-02-31 회의\n15:00~14:00 미팅' }], today);
  assert.equal(items[0].date, '2026-10-06');
  assert.equal(items[1].kind, 'task');
});
test('merges schedules without erasing existing planner content and rejects occupied slots', () => {
  const entry = { todos: [{ id: 'old', label: '기존 일정', color: '#000', done: false }], journal: [{ type: 'paragraph' }], grid: { startHour: 0, endHour: 24, cols: 12, cells: { 0: 'old' }, strokes: [] } };
  const next = addSuggestedSchedule(entry, { title: '팀 회의', startTime: '14:00', endTime: '15:30' }, 'new');
  assert.equal(next.todos.length, 2);
  assert.equal(next.grid.cells['168'], 'new');
  assert.equal(next.grid.cells['185'], 'new');
  assert.equal(next.grid.cells['0'], 'old');
  assert.deepEqual(next.journal, entry.journal);
  assert.throws(() => addSuggestedSchedule(next, { title: '겹치는 일정', startTime: '14:30', endTime: '15:00' }, 'other'), /겹/);
  assert.equal(entry.todos.length, 1);
});
