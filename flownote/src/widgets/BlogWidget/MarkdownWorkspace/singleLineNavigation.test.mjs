import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { singleLineBoundary } from './singleLineNavigation.ts';

const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', group: 'block' }, text: { group: 'inline' } } });
function fixture(wrapped = false) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text('abcdef'))]);
  const view = { state: EditorState.create({ doc, selection: TextSelection.create(doc, 5) }), composing: false,
    coordsAtPos: pos => ({ top: wrapped && pos > 1 ? 20 : 0 }),
    dispatch(tr) { assert.equal(tr.docChanged, false); this.state = this.state.apply(tr); } };
  return view;
}
test('single-line Home/End synchronously commit PM caret and Shift selection without changing content', () => {
  const view = fixture(); let prevented = 0;
  const key = (key, options = {}) => singleLineBoundary(view, { key, preventDefault() { prevented++; }, ...options });
  assert.equal(key('Home'), true); assert.equal(view.state.selection.head, 1);
  assert.equal(key('End'), true); assert.equal(view.state.selection.head, 7);
  assert.equal(key('Home', { shiftKey: true }), true); assert.equal(view.state.selection.anchor, 7); assert.equal(view.state.selection.head, 1);
  assert.equal(view.state.doc.textContent, 'abcdef'); assert.equal(prevented, 3);
});
test('wrapped visual lines, modifiers and active composition keep native navigation', () => {
  for (const [view, options] of [[fixture(true), {}], [fixture(), { ctrlKey: true }], [fixture(), { metaKey: true }], [fixture(), { altKey: true }], [fixture(), { isComposing: true }]]) {
    assert.equal(singleLineBoundary(view, { key: 'Home', preventDefault() { throw Error('Native navigation must remain available'); }, ...options }), false);
    assert.equal(view.state.selection.head, 5);
  }
});
