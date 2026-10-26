import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Search, Trash2 } from 'lucide-react';
import { deleteTerm, listTerms, lookupTerm, saveTermDefinition, type Book, type DictionaryResult, type LibraryTerm } from '@/features/library';
import LibraryDialog from './LibraryDialog';

export default function ReaderDictionary({ owner, book, page, initialTerm, close }: {
  owner: string; book: Book; page: number; initialTerm: string; close: () => void;
}) {
  const [query, setQuery] = useState(initialTerm);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [terms, setTerms] = useState<LibraryTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState('');
  const [definition, setDefinition] = useState('');
  const alive = useRef(true);
  const started = useRef(false);
  const refresh = useCallback(async () => {
    const saved = await listTerms(owner, book.id);
    if (alive.current) setTerms(saved);
  }, [owner, book.id]);
  const search = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const found = await lookupTerm(owner, book.id, page, term);
      if (alive.current) setResult(found);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '사전 검색에 실패했습니다.'); }
    finally { if (alive.current) { setBusy(false); void refresh().catch(() => {}); } }
  }, [owner, book.id, page, refresh]);
  useEffect(() => {
    alive.current = true;
    void listTerms(owner, book.id).then(saved => { if (alive.current) setTerms(saved); }).catch(() => {});
    if (initialTerm && !started.current) {
      started.current = true;
      queueMicrotask(() => { if (alive.current) void search(initialTerm); });
    }
    return () => { alive.current = false; };
  }, [owner, book.id, initialTerm, search]);
  return <LibraryDialog title="사전과 단어장" close={close}>
    <p className="library-muted">{book.title} · {page}쪽 · 검색한 단어와 뜻을 이 책의 단어장에 저장합니다.</p>
    <form className="reader-dictionary-search" onSubmit={event => { event.preventDefault(); void search(query); }}>
      <label>선택한 단어<input aria-label="사전에서 검색할 단어" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /></label>
      <button className="library-primary" disabled={busy || !query.trim()}><Search size={16} />{busy ? '검색·저장 중…' : '사전 검색'}</button>
    </form>
    <p className="library-muted">선택한 단어만 Wiktionary에 조회합니다. PDF 원본은 사전으로 전송하지 않습니다.</p>
    {error && <p role="alert">{error}</p>}
    {result && <section className="reader-dictionary-result" aria-label="사전 검색 결과">
      <h3>{result.term}</h3><p>{result.found ? result.definition : '사전에 일치하는 뜻이 없습니다. 단어는 저장했으며, 단어장에서 뜻이나 메모를 직접 적을 수 있습니다.'}</p>
      <a href={`https://en.wiktionary.org/wiki/${encodeURIComponent(result.term)}`} target="_blank" rel="noopener noreferrer">Wiktionary · CC BY-SA <ExternalLink size={14} /></a>
    </section>}
    <section aria-label="저장한 단어장" className="reader-word-list"><h3><BookOpen size={18} />저장한 단어 <span>{terms.length}</span></h3>
      {!terms.length && <p className="library-muted">페이지에서 단어를 드래그해 선택하거나 위에서 검색해 보세요.</p>}
      {terms.map(term => <article key={term.id}>
        <header><strong>{term.term}</strong><span>{term.page}쪽{term.pending ? ' · 기기에 보관 중' : ' · 클라우드 저장됨'}</span>
          <button aria-label={`${term.term} 단어 삭제`} disabled={busy} onClick={() => {
            setBusy(true); setError('');
            void deleteTerm(owner, term).catch(failure => { if (alive.current) setError(String(failure)); })
              .finally(() => { if (alive.current) { setBusy(false); void refresh().catch(() => {}); } });
          }}><Trash2 size={15} /></button></header>
        {editing === term.id ? <form onSubmit={event => {
          event.preventDefault(); setBusy(true); setError('');
          void saveTermDefinition(owner, term, definition).then(() => { if (alive.current) setEditing(''); })
            .catch(failure => { if (alive.current) setError(String(failure)); })
            .finally(() => { if (alive.current) { setBusy(false); void refresh().catch(() => {}); } });
        }}><textarea aria-label={`${term.term} 뜻과 메모`} value={definition} maxLength={8000} onChange={event => setDefinition(event.target.value)} />
          <button disabled={busy}>뜻·메모 저장</button><button type="button" onClick={() => setEditing('')}>취소</button></form>
          : <><p>{term.definition || '아직 저장한 뜻이 없습니다.'}</p><button disabled={busy} onClick={() => { setEditing(term.id); setDefinition(term.definition); }}>뜻·메모 편집</button></>}
        <a href={`https://en.wiktionary.org/wiki/${encodeURIComponent(term.term)}`} target="_blank" rel="noopener noreferrer">Wiktionary 원문</a>
      </article>)}
    </section>
  </LibraryDialog>;
}
