import { InputRule } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import { inlineMathMatch, multilineMath } from './mathInput';

export const NoteInlineMath = InlineMath.extend({
  addInputRules() {
    return [new InputRule({
      find: text => {
        const result = inlineMathMatch(text);
        return result ? { index: result.from, text: text.slice(result.from), data: { latex: result.latex } } : null;
      },
      handler: ({ state, range, match }) => { state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match.data?.latex })); },
    })];
  },
});

export const NoteBlockMath = BlockMath.extend({
  addInputRules() {
    return [new InputRule({
      find: /^(?:\$\$[^$\n]+\$\$|\$\$)$/,
      handler: ({ state, range, match }) => {
        const $from = state.doc.resolve(range.from);
        if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null;
        let from = $from.before(1), latex = match[0].length > 4 ? match[0].slice(2, -2).trim() : null;
        if (!latex) {
          const lines = ['$$'];
          for (let index = $from.index(0) - 1; index >= 0; index--) {
            const node = state.doc.child(index);
            if (node.type.name !== 'paragraph') return null;
            from -= node.nodeSize;
            lines.unshift(node.textBetween(0, node.content.size, '\n', '\n'));
            if (lines[0].trim() === '$$') { latex = multilineMath(lines); break; }
          }
        }
        if (!latex) return null;
        const node = this.type.create({ latex }), tr = state.tr;
        tr.replaceWith(from, $from.after(1), [node, state.schema.nodes.paragraph.create()]);
        tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize + 1));
      },
    })];
  },
});
