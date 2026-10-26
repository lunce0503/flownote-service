import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { createLiveMarkdownParser } from './liveMarkdownParser.ts';

test('task lists preserve later headings, bold and Korean across Markdown reload', () => {
  for (let iteration = 0; iteration < 2; iteration++) {
    const manager = new MarkdownManager({ marked: createLiveMarkdownParser(), extensions: [StarterKit, TaskList, TaskItem] });
    const parsed = manager.parse('- [x] Existing task\n\n&nbsp;\n\n## Instant heading\n\n**Rendered immediately**\n\n한글 최종 입력');
    const serialized = JSON.stringify(parsed);
    for (const value of ['taskItem', 'Instant heading', 'Rendered immediately', '한글 최종 입력']) assert.ok(serialized.includes(value), value);
    assert.equal(parsed.content[0].content[0].attrs.checked, true);
  }
});
