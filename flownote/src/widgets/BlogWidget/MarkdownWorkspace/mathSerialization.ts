import type { JSONContent } from '@tiptap/core';

// Adjacent $a$$b$ is ambiguous to Markdown/remark-math. Separate only adjacent
// math atoms in the serialization snapshot; never rewrite opened source or the editor selection.
export function separateAdjacentInlineMath(node: JSONContent): JSONContent {
  if (!node.content?.length) return node;
  const content: JSONContent[] = [];
  for (const original of node.content) {
    const child = separateAdjacentInlineMath(original);
    if (content.at(-1)?.type === 'inlineMath' && child.type === 'inlineMath') content.push({ type: 'text', text: ' ' });
    content.push(child);
  }
  return { ...node, content };
}
