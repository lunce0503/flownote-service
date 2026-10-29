import type { EditorView } from '@tiptap/pm/view';
import { TextSelection } from '@tiptap/pm/state';

// The browser's DOM Home/End can precede PM's asynchronous selectionchange.
// Commit a single visual text line synchronously; wrapped lines and OS shortcuts
// retain the browser's native navigation semantics.
export function singleLineBoundary(view: EditorView, event: KeyboardEvent): boolean {
  if (!['Home', 'End'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || view.composing) return false;
  const { state } = view, { $head } = state.selection;
  if (!$head.parent.isTextblock) return false;
  const start = $head.start(), end = $head.end();
  if (Math.abs(view.coordsAtPos(start).top - view.coordsAtPos(end).top) > 1) return false;
  const target = event.key === 'Home' ? start : end;
  const next = TextSelection.create(state.doc, event.shiftKey ? state.selection.anchor : target, target);
  event.preventDefault();
  if (!state.selection.eq(next)) view.dispatch(state.tr.setSelection(next).scrollIntoView());
  return true;
}
