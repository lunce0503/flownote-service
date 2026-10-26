import { useEffect, useRef } from 'react';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Mathematics } from '@tiptap/extension-mathematics';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Bold, Code, Heading2, Italic, List, Sigma } from 'lucide-react';
import { safeMarkdownUrl } from '@/entities/blog';
import 'katex/dist/katex.min.css';

const editedViews = new WeakSet<EditorView>();

const SafeImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), src: { default: null,
      parseHTML: element => safeMarkdownUrl(element.getAttribute('src') ?? '') || null,
      renderHTML: attributes => ({ src: safeMarkdownUrl(String(attributes.src ?? '')) || null }) } };
  },
});

export default function LiveMarkdownEditor({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (markdown: string) => void;
}) {
  const lastChange = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      link: { openOnClick: false, isAllowedUri: url => !!safeMarkdownUrl(url),
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      underline: false,
    }), Markdown, Mathematics.configure({ katexOptions: { trust: false, throwOnError: false, strict: 'ignore' },
      inlineOptions: { onClick(node, pos) { const latex = window.prompt('LaTeX 수식 수정', String(node.attrs.latex)); if (latex !== null && editor) { editedViews.add(editor.view); editor.chain().focus().updateInlineMath({ latex, pos }).run(); } } },
      blockOptions: { onClick(node, pos) { const latex = window.prompt('LaTeX 수식 수정', String(node.attrs.latex)); if (latex !== null && editor) { editedViews.add(editor.view); editor.chain().focus().updateBlockMath({ latex, pos }).run(); } } },
    }),
    TableKit, TaskList, TaskItem.configure({ nested: true }), SafeImage.configure({ allowBase64: false })],
    content: value, contentType: 'markdown', editable: !disabled,
    editorProps: { attributes: { role: 'textbox', 'aria-label': '노트 편집', 'aria-multiline': 'true',
      class: 'note-markdown note-live-content', spellcheck: 'false' },
      handleDOMEvents: {
        beforeinput(view) { editedViews.add(view); return false; },
        paste(view) { editedViews.add(view); return false; },
        drop(view) { editedViews.add(view); return false; },
        compositionstart(view) { editedViews.add(view); return false; },
        keydown(view, event) { if (event.key.length === 1 || ['Enter', 'Backspace', 'Delete', 'Tab'].includes(event.key) || ((event.ctrlKey || event.metaKey) && /[bzivy]/i.test(event.key))) editedViews.add(view); return false; },
      },
      handlePaste(view, event) {
        if (!view.editable) return false;
        const text = event.clipboardData?.getData('text/plain');
        if (!text || event.clipboardData?.getData('text/html')) return false;
        const active = view.dom.closest('[data-testid="markdown-live-editor"]');
        if (!active) return false;
        // The Markdown parser preserves tables, tasks and math instead of pasting raw delimiters.
        const current = editor;
        if (!current) return false;
        event.preventDefault(); current.commands.insertContent(text, { contentType: 'markdown' }); return true;
      },
    },
    onUpdate({ editor }) {
      if (disabled || !editedViews.has(editor.view)) return;
      const markdown = editor.getMarkdown();
      lastChange.current = markdown; onChange(markdown);
    },
  });
  const edit = (action: () => void) => { if (editor) editedViews.add(editor.view); action(); };
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive('bold') ?? false, italic: editor?.isActive('italic') ?? false,
    heading: editor?.isActive('heading', { level: 2 }) ?? false, bullet: editor?.isActive('bulletList') ?? false,
    code: editor?.isActive('codeBlock') ?? false,
  }) });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor || value === lastChange.current) return;
    // Recovery or explicit source changes are applied without producing a second save or resetting a typing cursor.
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false }); lastChange.current = value;
  }, [editor, value]);
  if (!editor) return <p role="status">편집기를 준비하고 있습니다…</p>;
  return <div className="note-live-editor" data-testid="markdown-live-editor">
    <div className="note-live-formatting" role="toolbar" aria-label="Markdown 서식">
      <button type="button" aria-label="굵게" aria-pressed={state?.bold} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleBold().run(); })}><Bold size={17} /></button>
      <button type="button" aria-label="기울임" aria-pressed={state?.italic} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleItalic().run(); })}><Italic size={17} /></button>
      <button type="button" aria-label="제목 2" aria-pressed={state?.heading} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); })}><Heading2 size={17} /></button>
      <button type="button" aria-label="글머리 목록" aria-pressed={state?.bullet} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleBulletList().run(); })}><List size={17} /></button>
      <button type="button" aria-label="코드 블록" aria-pressed={state?.code} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleCodeBlock().run(); })}><Code size={17} /></button>
      <button type="button" aria-label="수식 추가" disabled={disabled} onClick={() => {
        const latex = window.prompt('LaTeX 수식', 'E = mc^2');
        if (latex?.trim()) edit(() => { editor.chain().focus().insertInlineMath({ latex }).run(); });
      }}><Sigma size={17} /></button>
      <span>Markdown을 입력하면 바로 서식이 적용됩니다.</span>
    </div>
    <EditorContent editor={editor} />
  </div>;
}
