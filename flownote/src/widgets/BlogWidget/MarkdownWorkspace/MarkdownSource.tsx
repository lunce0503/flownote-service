import { useRef, useState } from 'react';
import LatexSuggestions from './LatexSuggestions';
import { latexCompletion, replaceCompletion, type LatexCommand } from './mathInput';

export default function MarkdownSource({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0), [dismissed, setDismissed] = useState('');
  const completion = disabled || dismissed === `${value}:${cursor}` ? null : latexCompletion(value, cursor);
  const choose = (command: LatexCommand) => {
    if (!completion) return;
    const next = replaceCompletion(value, completion, command);
    onChange(next.value); setCursor(next.cursor);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.cursor, next.cursor); });
  };
  return <div className="note-source-editor">
    <textarea ref={input} aria-label="Markdown 본문" spellCheck={false} value={value} disabled={disabled}
      onChange={event => { setCursor(event.target.selectionStart); onChange(event.target.value); }}
      onSelect={event => setCursor(event.currentTarget.selectionStart)} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (completion && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); choose(completion.items[0]); }
        if (completion && event.key === 'Escape') { event.preventDefault(); setDismissed(`${value}:${cursor}`); }
      }} />
    <LatexSuggestions completion={completion} choose={choose} />
  </div>;
}
