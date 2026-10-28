import type { LatexCommand, MathCompletion } from './mathInput';

export default function LatexSuggestions({ completion, choose }: { completion: MathCompletion | null; choose: (command: LatexCommand) => void }) {
  if (!completion) return null;
  return <div className="note-latex-suggestions" role="group" aria-label="LaTeX 명령어 추천">
    {completion.items.map(command => <button type="button" key={command.label} onMouseDown={event => event.preventDefault()} onClick={() => choose(command)}>
      <code>{command.label}</code><span>{command.description}</span>
    </button>)}
    <small>Tab으로 첫 명령어 삽입 · Esc 닫기</small>
  </div>;
}
