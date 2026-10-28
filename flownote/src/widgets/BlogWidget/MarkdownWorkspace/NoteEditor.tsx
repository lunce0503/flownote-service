import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { convertLegacy, isMarkdown, noteDrafts, recoveryState, getNote, postNoteData } from '@/entities/blog';
import type { BlockDataProps, NoteDraft } from '@/entities/blog';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { getAuthUser } from '@/shared/api';
import { isDeviceOnly } from '@/shared/lib/deviceMode';
import { getSyncClientId, subscribeSyncEvents } from '@/shared/lib/sync';
import { createNoteSaveQueue, waitForNoteSave } from '@/features/blog';
import { Code, Columns2, Download, Eye, MoreVertical, Pencil, RefreshCw, SlidersHorizontal } from 'lucide-react';
import MarkdownSource from './MarkdownSource';

import { downloadNote } from './downloadNote';

const Preview = lazy(() => import('./MarkdownPreview'));
const LiveEditor = lazy(() => import('./LiveMarkdownEditor'));

type RegisterRename = (rename: ((title: string) => void) | null) => void;
export default function NoteEditor({ owner, id, onSaved, registerRename }: { owner: string; id: string; onSaved: (saved: BlockDataProps) => void; registerRename: RegisterRename }) {
  const [loaded, setLoaded] = useState<{ note: BlockDataProps; draft: NoteDraft | null; draftError: boolean } | null>(null);
  const [error, setError] = useState('');
  const [failedDraft, setFailedDraft] = useState<NoteDraft | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      await waitForNoteSave(owner, id);
      const note = await getNote(id, abort.signal);
      let draftError = false;
      const draft = await noteDrafts.read(owner, id).catch(() => { draftError = true; return null; });
      if (!abort.signal.aborted && getAuthUser()?.id === owner) setLoaded({ note, draft, draftError });
    })().catch(async () => {
      const local = await noteDrafts.read(owner, id).catch(() => null);
      if (!abort.signal.aborted && getAuthUser()?.id === owner) {
        setFailedDraft(local);
        setError('본문을 불러오지 못했습니다. 입력 가능한 빈 문서로 대체하지 않았습니다.');
      }
    });
    return () => abort.abort();
  }, [owner, id, reload]);
  if (error) return <div role="alert" className="note-notice">{error}
    <button onClick={() => { setError(''); setFailedDraft(null); setReload(v => v + 1); }}>다시 불러오기</button>
    {failedDraft && <>
      <p>서버본 확인 전에도 기기 초안을 내보낼 수 있습니다.</p>
      <button onClick={() => downloadNote(`${failedDraft.note.title}-draft.json`, JSON.stringify(failedDraft.note, null, 2), 'application/json')}>기기 초안 JSON 내보내기</button>
      {isMarkdown(failedDraft.note.content) && <button onClick={() => {
        if (isMarkdown(failedDraft.note.content)) downloadNote(`${failedDraft.note.title}-draft.md`, failedDraft.note.content.markdown);
      }}>기기 초안 .md 내보내기</button>}
    </>}
  </div>;
  if (!loaded) return <p role="status">선택한 노트를 불러오는 중…</p>;
  return <Editor key={`${owner}:${id}:${reload}`} owner={owner} initial={loaded.note} draft={loaded.draft} draftError={loaded.draftError} onSaved={onSaved} registerRename={registerRename}
    reload={() => { setLoaded(null); setReload(v => v + 1); }} />;
}

function Editor({ owner, initial, draft, draftError, onSaved, reload, registerRename }: {
  owner: string; initial: BlockDataProps; draft: NoteDraft | null; draftError: boolean; onSaved: (saved: BlockDataProps) => void; reload: () => void; registerRename: RegisterRename;
}) {
  const state = draft ? recoveryState(draft, initial) : 'matched';
  const [note, setNote] = useState(initial);
  useDocumentTitle("노트", note.title);
  const noteRef = useRef(initial);
  const [recovery, setRecovery] = useState(state !== 'matched' ? draft : null);
  const [status, setStatus] = useState(draftError ? '기기 초안 저장소를 사용할 수 없습니다 — 내보내기 필요' : state === 'matched' ? isDeviceOnly() ? '기기에 저장됨 · 동기화 꺼짐' : '서버에 저장됨' : '복구 확인 필요');
  const [mode, setMode] = useState<'edit' | 'source' | 'preview' | 'split'>('edit');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [original, setOriginal] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [queue] = useState(() => createNoteSaveQueue(owner, initial, async snapshot => {
    const saved = await postNoteData({ ...snapshot, client_id: getSyncClientId() });
    onSaved(saved); return saved;
  }, () => getAuthUser()?.id === owner, setStatus));
  const needsReview = remoteChanged || queue.conflicted;
  useEffect(() => {
    noteDrafts.activate(owner);
    queue.resume();
    if (draft && state === 'matched') void noteDrafts.ack(owner, initial.id, draft.sequence).catch(() => setStatus('기기 초안 정리 실패'));
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!queue.hasPending) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    const unsubscribe = subscribeSyncEvents(event => {
      if (event.resource !== 'notes' && event.resource !== 'all') return;
      if (event.clientId === getSyncClientId() || event.action.startsWith('folder-')) return;
      if (!event.noteId || event.noteId === initial.id) { queue.pause(); setRemoteChanged(true); }
    });
    return () => { window.removeEventListener('beforeunload', beforeUnload); unsubscribe(); queue.pause(); };
  }, [owner, initial.id, queue, draft, state]);
  const change = (next: BlockDataProps) => {
    noteRef.current = next; setNote(next);
    try { queue.capture(next); } catch { setStatus('기기 보관 실패 — .md 내보내기를 사용하세요'); }
  };
  useEffect(() => {
    registerRename(title => {
      if (recovery || needsReview) throw new Error('초안과 서버 변경을 먼저 확인하세요.');
      const next = { ...noteRef.current, title };
      noteRef.current = next; setNote(next); queue.capture(next);
    });
    return () => registerRename(null);
  }, [registerRename, recovery, needsReview, queue]);
  const markdown = isMarkdown(note.content) ? note.content : null;
  const legacy = Array.isArray(note.content) ? note.content : markdown?.legacy_original;
  const converted = Array.isArray(note.content) ? convertLegacy(note.content) : null;
  return <div className="note-document">
    {(recovery || needsReview) && <div className="note-notice" role="alert">
      {recovery ? '기기에 저장된 입력이 있습니다. 서버본과 초안을 확인한 뒤 선택하세요.' : '다른 창의 변경을 확인해야 합니다. 자동 저장을 멈췄습니다.'}
      {recovery && <>
        <button onClick={() => {
          if (state === 'conflict' && !window.confirm('서버본과 다릅니다. 초안을 최신 서버본 위에 저장할까요?')) return;
          change({ ...recovery.note, revision: initial.revision }); setRecovery(null);
        }}>초안 복구</button>
        <button onClick={() => downloadNote(`${recovery.note.title}-draft.json`, JSON.stringify(recovery.note, null, 2), 'application/json')}>초안 내보내기</button>
        <button onClick={() => {
          if (!window.confirm('기기 초안을 버리고 서버본을 사용할까요?')) return;
          void noteDrafts.ack(owner, initial.id, recovery.sequence).then(() => setRecovery(null)).catch(() => setStatus('초안 정리 실패'));
        }}>서버본 사용</button>
      </>}
      {needsReview && <button onClick={() => {
        if (window.confirm('기기 초안 또는 내보내기를 확인한 뒤 최신 서버본을 불러올까요?')) reload();
      }}>서버본 확인</button>}
    </div>}
    <div className="note-document-heading">
      <input aria-label="노트 제목" value={note.title} disabled={!!recovery || needsReview} autoFocus={initial.title === '제목 없음'} onFocus={event => { if (event.target.value === '제목 없음') event.target.select(); }}
        onChange={e => change({ ...noteRef.current, title: e.target.value })}
        onCompositionEnd={e => change({ ...noteRef.current, title: e.currentTarget.value })} />
      <span role="status" data-testid="note-save-status">{status}</span>
    </div>
    <div className="note-document-tools" onKeyDown={event => {
      if (event.key !== 'Escape') return;
      const menu = event.currentTarget.querySelector<HTMLDetailsElement>('details[open]');
      if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
    }}>
      {markdown && <>
        <button aria-label="편집" title="편집" aria-pressed={mode !== 'preview'} onClick={() => setMode('edit')}><Pencil size={18} /></button>
        <button aria-label="미리보기" title="미리보기" aria-pressed={mode === 'preview'} onClick={() => { setMode('preview'); setToolsOpen(false); }}><Eye size={18} /></button>
        {mode !== 'preview' && <button aria-label="편집 도구" title="편집 도구" aria-expanded={toolsOpen} aria-controls="note-input-tools" onClick={() => setToolsOpen(value => !value)}><SlidersHorizontal size={18} /></button>}
      </>}
      <details className="note-settings-menu"><summary aria-label="노트 세부 설정" title="노트 세부 설정"><MoreVertical size={19} /></summary><div onClick={event => { if ((event.target as Element).closest('button')) event.currentTarget.closest('details')?.removeAttribute('open'); }}>
        {markdown && <>
          <button onClick={() => downloadNote(`${note.title.replace(/\.md$/i, '') || 'note'}.md`, markdown.markdown)}><Download size={16} />.md 내보내기</button>
          <button disabled={!!recovery || needsReview} onClick={() => queue.retry()}><RefreshCw size={16} />저장 다시 시도</button>
          <button onClick={() => { if (!queue.hasPending || window.confirm('미저장 입력이 있습니다. 저장 실패가 있다면 먼저 .md로 내보내세요. 서버본과 기기 초안을 다시 확인할까요?')) reload(); }}>서버본·초안 확인</button>
        </>}
        {legacy && <>
          <button aria-expanded={original} onClick={() => setOriginal(value => !value)}>원본 보기</button>
          <button onClick={() => downloadNote(`${note.title}-original.json`, JSON.stringify(legacy, null, 2), 'application/json')}>원본 JSON 내보내기</button>
        </>}
      </div></details>
    </div>
    {markdown && mode !== 'preview' && toolsOpen && <div id="note-input-tools" className="note-input-tools" role="group" aria-label="Markdown 입력 방식">
      <button aria-label="실시간 편집" title="실시간 편집" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}><Pencil size={17} /><span>실시간</span></button>
      <button aria-label="원문" title="Markdown 원문" aria-pressed={mode === 'source'} onClick={() => setMode('source')}><Code size={17} /><span>원문</span></button>
      <button aria-label="나란히" title="원문과 미리보기 나란히" aria-pressed={mode === 'split'} onClick={() => setMode('split')}><Columns2 size={17} /><span>나란히</span></button>
    </div>}
    {original && <pre className="note-original" data-testid="legacy-original">{JSON.stringify(legacy, null, 2)}</pre>}
    {converted && <div className="note-notice">
      <p>기존 문서입니다. 열기만 해서는 변경되지 않습니다. 전환 후에도 모든 블록은 원본 JSON으로 보관됩니다.</p>
      {converted.warnings.length > 0 && <p>원본에서 확인할 내용: {converted.warnings.join(', ')}</p>}
      <button disabled={!!recovery || needsReview} onClick={() => {
        if (window.confirm('원본을 보관하고 Markdown으로 전환할까요? 일부 서식·그리기는 원본 보기에서 확인할 수 있습니다.')) change({ ...note, content: converted.content });
      }}>원본 보관 후 Markdown으로 전환</button>
      <button onClick={() => setMode('preview')}>변환 미리보기</button>
      {mode === 'preview' && <Suspense fallback={<p>미리보기 준비 중…</p>}><Preview source={converted.content.markdown} /></Suspense>}
    </div>}
    {markdown && <div className={`note-editors note-editors-${mode}`}>
      {mode === 'edit' && <Suspense fallback={<p role="status">편집기 준비 중…</p>}><LiveEditor value={markdown.markdown} disabled={!!recovery || needsReview} toolsOpen={toolsOpen}
        onChange={value => change({ ...noteRef.current, content: { ...markdown, markdown: value } })} /></Suspense>}
      {(mode === 'source' || mode === 'split') && <MarkdownSource value={markdown.markdown} disabled={!!recovery || needsReview} onChange={value => change({ ...noteRef.current, content: { ...markdown, markdown: value } })} />}
      {(mode === 'preview' || mode === 'split') && <Suspense fallback={<p role="status">미리보기 준비 중…</p>}><Preview source={markdown.markdown} /></Suspense>}
    </div>}
  </div>;
}
