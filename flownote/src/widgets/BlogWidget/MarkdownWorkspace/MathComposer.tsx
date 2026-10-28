import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { X } from 'lucide-react';
import LatexSuggestions from './LatexSuggestions';
import { latexCompletion, replaceCompletion, type LatexCommand } from './mathInput';

export type MathDraft = { latex: string; kind: 'inline' | 'block'; pos?: number };
export default function MathComposer({ initial, apply, close }: { initial: MathDraft; apply: (draft: MathDraft) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(initial), [cursor, setCursor] = useState(initial.latex.length), [dismissed, setDismissed] = useState('');
  useEffect(() => { dialog.current?.showModal(); input.current?.focus(); }, []);
  const completion = dismissed === `${draft.latex}:${cursor}` ? null : latexCompletion(draft.latex, cursor, true);
  const choose = (command: LatexCommand) => {
    if (!completion) return;
    const next = replaceCompletion(draft.latex, completion, command);
    setDraft(value => ({ ...value, latex: next.value })); setCursor(next.cursor);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.cursor, next.cursor); });
  };
  return <dialog className="note-math-dialog" ref={dialog} aria-label="수식 편집" onCancel={close} onClose={close}>
    <form onSubmit={event => { event.preventDefault(); if (draft.latex.trim()) apply({ ...draft, latex: draft.latex.trim() }); }}>
      <header><h2>수식</h2><button type="button" aria-label="수식 창 닫기" onClick={close}><X size={19} /></button></header>
      <div className="note-math-kind" role="group" aria-label="수식 배치">
        <button type="button" aria-pressed={draft.kind === 'inline'} onClick={() => setDraft(value => ({ ...value, kind: 'inline' }))}>문장 안</button>
        <button type="button" aria-pressed={draft.kind === 'block'} onClick={() => setDraft(value => ({ ...value, kind: 'block' }))}>독립된 여러 줄</button>
      </div>
      <label>LaTeX 수식<textarea ref={input} value={draft.latex} spellCheck={false} rows={4} onChange={event => { setDraft(value => ({ ...value, latex: event.target.value })); setCursor(event.target.selectionStart); }}
        onSelect={event => setCursor(event.currentTarget.selectionStart)} onKeyDown={event => {
          if (completion && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); choose(completion.items[0]); }
          if (completion && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(`${draft.latex}:${cursor}`); }
        }} /></label>
      <LatexSuggestions completion={completion} choose={choose} />
      <p className="note-math-help">문장 안은 $ 수식 $, 여러 줄은 $$ 사이에 입력하세요. \frac, \sqrt, \sum 등의 명령어를 추천합니다.</p>
      <div className="note-math-preview" aria-label="수식 미리보기" dangerouslySetInnerHTML={{ __html: katex.renderToString(draft.latex, { displayMode: draft.kind === 'block', trust: false, throwOnError: false, strict: 'ignore' }) }} />
      <footer><button type="button" onClick={close}>취소</button><button type="submit" disabled={!draft.latex.trim()}>수식 적용</button></footer>
    </form>
  </dialog>;
}
