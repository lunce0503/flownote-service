import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Bold, Code, Heading2, Italic, List, Sigma } from 'lucide-react';
import { safeMarkdownUrl } from '@/entities/blog';
import 'katex/dist/katex.min.css';
import { createLiveMarkdownParser } from './liveMarkdownParser';
import { NoteInlineMath, NoteBlockMath } from './mathExtensions';
import { latexCompletion, type LatexCommand, type MathCompletion } from './mathInput';
import LatexSuggestions from './LatexSuggestions';
import MathComposer, { type MathDraft } from './MathComposer';
import { markdownSync } from './markdownSync';
import { separateAdjacentInlineMath } from './mathSerialization';
import { singleLineBoundary } from './singleLineNavigation';

const serialize = (editor: Editor) => editor.markdown!.serialize(separateAdjacentInlineMath(editor.getJSON()));

const editedViews = new WeakSet<EditorView>();

const SafeImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), src: { default: null,
      parseHTML: element => safeMarkdownUrl(element.getAttribute('src') ?? '') || null,
      renderHTML: attributes => ({ src: safeMarkdownUrl(String(attributes.src ?? '')) || null }) } };
  },
});

export default function LiveMarkdownEditor({ value, disabled, toolsOpen, onChange }: {
  value: string; disabled: boolean; toolsOpen: boolean; onChange: (markdown: string) => void;
}) {
  const lastChange = useRef(value);
  const [sync] = useState(() => markdownSync(value));
  const [parser] = useState(createLiveMarkdownParser);
  const [math, setMath] = useState<MathDraft | null>(null);
  const [dismissed, setDismissed] = useState('');
  const completionRef = useRef<MathCompletion | null>(null);
  const chooseRef = useRef<(command: LatexCommand) => void>(() => {});
  const currentEditor = useRef<Editor | null>(null);
  const latest = useRef({ disabled, onChange });
  useLayoutEffect(() => { latest.current = { disabled, onChange }; }, [disabled, onChange]);
  const inlineClick = useCallback((node: ProseMirrorNode, pos: number) => {
    if (!latest.current.disabled) setMath({ latex: String(node.attrs.latex), pos, kind: 'inline' });
  }, []);
  const blockClick = useCallback((node: ProseMirrorNode, pos: number) => {
    if (!latest.current.disabled) setMath({ latex: String(node.attrs.latex), pos, kind: 'block' });
  }, []);
  const compositionEnd = useCallback((view: EditorView) => {
    // Windows IME finishes its DOM transaction after compositionend.
    setTimeout(() => {
      const editor = currentEditor.current;
      if (!editor || editor.isDestroyed || view.composing || !view.editable) return;
      const markdown = serialize(editor);
      if (markdown !== lastChange.current) { lastChange.current = markdown; sync.emit(markdown); latest.current.onChange(markdown); }
    }, 0);
    return false;
  }, [sync]);
  const keydown = useCallback((view: EditorView, event: KeyboardEvent) => {
    if (view.composing || event.isComposing || event.keyCode === 229) return false;
    if (singleLineBoundary(view, event)) return true;
    const completion = completionRef.current;
    if (completion && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); chooseRef.current(completion.items[0]); return true; }
    if (completion && event.key === 'Escape') { event.preventDefault(); setDismissed(view.state.doc.textBetween(0, view.state.selection.from, '\n', '\ufffc')); return true; }
    if (event.key.length === 1 || ['Enter', 'Backspace', 'Delete', 'Tab'].includes(event.key) || ((event.ctrlKey || event.metaKey) && /[bzivy]/i.test(event.key))) editedViews.add(view);
    return false;
  }, []);
  const paste = useCallback((view: EditorView, event: ClipboardEvent) => {
    if (!view.editable) return false;
    const text = event.clipboardData?.getData('text/plain');
    if (!text || event.clipboardData?.getData('text/html')) return false;
    if (!view.dom.closest('[data-testid="markdown-live-editor"]')) return false;
    const editor = currentEditor.current;
    if (!editor) return false;
    event.preventDefault(); editor.commands.insertContent(text, { contentType: 'markdown' }); return true;
  }, []);
  const update = useCallback(({ editor }: { editor: Editor }) => {
    if (latest.current.disabled || editor.view.composing || !editedViews.has(editor.view)) return;
    const markdown = serialize(editor);
    if (markdown === lastChange.current) return;
    lastChange.current = markdown; sync.emit(markdown); latest.current.onChange(markdown);
  }, [sync]);
  // Tiptap updates its view when options/extension identities change. Keep normal
  // React typing/save/selection renders from restoring an older PM selection.
  // configure() stores the event callbacks; it never invokes their ref reads during render.
  // eslint-disable-next-line react-hooks/refs
  const [options] = useState(() => {
    const mathOptions = { katexOptions: { trust: false, throwOnError: false, strict: 'ignore' as const } };
    return {
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      link: { openOnClick: false, isAllowedUri: url => !!safeMarkdownUrl(url),
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      underline: false,
    }), Markdown.configure({ marked: parser }),
    NoteInlineMath.configure({ ...mathOptions, onClick: inlineClick }),
    NoteBlockMath.configure({ ...mathOptions, katexOptions: { ...mathOptions.katexOptions, displayMode: true }, onClick: blockClick }),
    TableKit, TaskList, TaskItem.configure({ nested: true }), SafeImage.configure({ allowBase64: false })],
    content: value, contentType: 'markdown',
    editorProps: { attributes: { role: 'textbox', 'aria-label': '노트 편집', 'aria-multiline': 'true',
      class: 'note-markdown note-live-content', spellcheck: 'false' },
      handleDOMEvents: {
        beforeinput(view) { editedViews.add(view); return false; },
        paste(view) { editedViews.add(view); return false; },
        drop(view) { editedViews.add(view); return false; },
        compositionstart(view) { editedViews.add(view); return false; },
        compositionend: compositionEnd,
        keydown,
      },
      handlePaste: paste,
    },
    onUpdate: update,
    } satisfies Parameters<typeof useEditor>[0];
  });
  const liveOptions = useMemo(() => ({ ...options, editable: !disabled }), [options, disabled]);
  const editor = useEditor(liveOptions);
  useLayoutEffect(() => { currentEditor.current = editor; }, [editor]);
  const edit = (action: () => void) => { if (editor) editedViews.add(editor.view); action(); };
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive('bold') ?? false, italic: editor?.isActive('italic') ?? false,
    heading: editor?.isActive('heading', { level: 2 }) ?? false, bullet: editor?.isActive('bulletList') ?? false,
    code: editor?.isActive('codeBlock') ?? false,
    before: editor?.state.doc.textBetween(0, editor.state.selection.from, '\n', '\ufffc') ?? '',
    inCode: editor?.isActive('codeBlock') || editor?.isActive('code') || false,
  }) });
  const completion = disabled || state?.inCode || dismissed === state?.before ? null : latexCompletion(state?.before ?? '', state?.before.length ?? 0);
  const choose = (command: LatexCommand) => {
    if (!editor || !completion) return;
    const from = editor.state.selection.from - (completion.to - completion.from);
    edit(() => { editor.chain().focus().insertContentAt({ from, to: editor.state.selection.from }, { type: 'text', text: command.insert }).setTextSelection(from + command.cursor).run(); });
  };
  useEffect(() => { completionRef.current = completion; chooseRef.current = choose; });
  useLayoutEffect(() => { if (editor && editor.isEditable !== !disabled) editor.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor || editor.view.composing || !sync.receive(value)) return;
    // Recovery or explicit source changes are applied without producing a second save or resetting a typing cursor.
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false }); lastChange.current = value;
  }, [editor, value, sync]);
  if (!editor) return <p role="status">편집기를 준비하고 있습니다…</p>;
  return <div className="note-live-editor" data-testid="markdown-live-editor">
    {toolsOpen && <div className="note-live-formatting" role="toolbar" aria-label="Markdown 서식">
      <button type="button" aria-label="굵게" title="굵게" aria-pressed={state?.bold} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleBold().run(); })}><Bold size={17} /></button>
      <button type="button" aria-label="기울임" title="기울임" aria-pressed={state?.italic} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleItalic().run(); })}><Italic size={17} /></button>
      <button type="button" aria-label="제목 2" title="제목 2" aria-pressed={state?.heading} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); })}><Heading2 size={17} /></button>
      <button type="button" aria-label="글머리 목록" title="글머리 목록" aria-pressed={state?.bullet} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleBulletList().run(); })}><List size={17} /></button>
      <button type="button" aria-label="코드 블록" title="코드 블록" aria-pressed={state?.code} disabled={disabled} onClick={() => edit(() => { editor.chain().focus().toggleCodeBlock().run(); })}><Code size={17} /></button>
      <button type="button" aria-label="수식 추가" title="수식 추가" disabled={disabled} onClick={() => setMath({ latex: '', kind: 'inline' })}><Sigma size={17} /></button>
    </div>}
    <EditorContent editor={editor} />
    <LatexSuggestions completion={completion} choose={choose} />
    {math && <MathComposer initial={math} close={() => setMath(null)} apply={draft => {
      edit(() => {
        const type = draft.kind === 'inline' ? 'inlineMath' : 'blockMath';
        if (draft.pos !== undefined) {
          const old = editor.state.doc.nodeAt(draft.pos);
          if (old && ['inlineMath', 'blockMath'].includes(old.type.name)) editor.chain().focus().insertContentAt({ from: draft.pos, to: draft.pos + old.nodeSize }, { type, attrs: { latex: draft.latex } }).run();
        } else if (draft.kind === 'inline') editor.chain().focus().insertInlineMath({ latex: draft.latex }).run();
        else editor.chain().focus().insertBlockMath({ latex: draft.latex }).run();
      });
      setMath(null);
    }} />}
  </div>;
}
