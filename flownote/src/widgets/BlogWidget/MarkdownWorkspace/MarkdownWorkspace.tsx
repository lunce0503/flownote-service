import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Folder, FolderPlus, PanelLeft, Plus, RefreshCw } from 'lucide-react';
import { addNoteToFolder, createNoteFolder, deleteNote, deleteNoteFolder, getNoteFolders, getNoteSummaries,
  noteDrafts, postNoteData, removeNoteFromFolder, updateNoteFolder, updateNoteTitle } from '@/entities/blog';
import type { BlockDataProps, NoteFolder, NoteSummary } from '@/entities/blog';
import { getAuthUser } from '@/shared/api';
import { newWorkspaceId } from '@/shared/lib/deviceMode';
import { getSyncClientId, subscribeSyncEvents } from '@/shared/lib/sync';
import { workspaceTree } from '@/features/blog';
import { pauseNoteSave, waitForNoteSave } from '@/features/blog';
import NoteEditor from './NoteEditor';
import '@/shared/styles/workspace.css';
import './workspace.css';

export default function MarkdownWorkspace() {
  const owner = getAuthUser()?.id ?? '';
  return <Workspace key={owner} owner={owner} />;
}
function Workspace({ owner }: { owner: string }) {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(() => window.matchMedia('(min-width: 701px)').matches);
  const [folderId, setFolderId] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`flownote.blog.tree:${owner}`) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });
  const sidebar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const summaryRequest = useRef<AbortController | null>(null);
  const renameCurrent = useRef<((title: string) => void) | null>(null);
  const registerRename = useCallback((rename: ((title: string) => void) | null) => { renameCurrent.current = rename; }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    summaryRequest.current?.abort();
    const request = new AbortController();
    summaryRequest.current = request;
    const isCurrent = () => current === generation.current && !request.signal.aborted && getAuthUser()?.id === owner;
    const results = await Promise.allSettled([
      getNoteSummaries(request.signal, page => {
        if (isCurrent()) { setNotes(page); setLoading(false); }
      }),
      getNoteFolders().then(value => { if (isCurrent()) setFolders(value); return value; }),
    ]);
    if (!isCurrent()) return;
    const [noteResult, folderResult] = results;
    if (noteResult.status === 'fulfilled') setNotes(noteResult.value);
    if (folderResult.status === 'fulfilled') setFolders(folderResult.value);
    setError(results.some(r => r.status === 'rejected') ? '목록 일부를 불러오지 못했습니다. 다시 시도하세요.' : '');
    setLoading(false);
  }, [owner]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const unsubscribe = subscribeSyncEvents(event => {
      if (event.clientId === getSyncClientId() && event.action.startsWith('note-')) return;
      if (event.resource === 'notes' || event.resource === 'all') void refresh();
    });
    return () => { active = false; summaryRequest.current?.abort(); unsubscribe(); };
  }, [refresh]);
  useEffect(() => {
    try { localStorage.setItem(`flownote.blog.tree:${owner}`, JSON.stringify(collapsed)); } catch { /* UI preference only */ }
  }, [collapsed, owner]);
  useEffect(() => {
    if (!drawer || !window.matchMedia('(max-width: 700px)').matches) return;
    const previous = document.activeElement as HTMLElement | null;
    const getItems = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button, select, [tabindex="0"], summary') ?? []).filter(e => e.getClientRects().length);
    getItems()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDrawer(false); }
      if (e.key === 'Tab') {
        const items = getItems(), first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [drawer]);
  const selectedFolder = folders.find(f => f.noteIds.includes(noteId ?? ''));
  const openedFolderId = selectedFolder?.id;
  const openedCategory = selectedFolder?.category.trim() || '카테고리 없음';
  useEffect(() => {
    if (!openedFolderId) return;
    queueMicrotask(() => setCollapsed(ids => ids.filter(id => id !== openedFolderId && id !== `category:${openedCategory}`)));
  }, [noteId, openedFolderId, openedCategory]);
  const activeFolder = folders.find(f => f.id === folderId) ?? selectedFolder;
  const selected = notes.find(n => n.id === noteId);
  const tree = workspaceTree(notes, folders);
  const handleSaved = useCallback((saved: BlockDataProps) => {
    if (getAuthUser()?.id !== owner) return;
    const summary: NoteSummary = { id: saved.id, title: saved.title, created_at: saved.created_at, updated_at: saved.updated_at, revision: saved.revision };
    setNotes(current => current.some(note => note.id === saved.id) ? current.map(note => note.id === saved.id ? summary : note) : [summary, ...current]);
  }, [owner]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch { setError('파일 작업에 실패했습니다. 최신 목록을 확인하고 다시 시도하세요. 입력과 원본은 유지됩니다.'); }
    finally { setBusy(false); }
  };
  const openNote = (id: string) => { navigate(`/blog/${id}`); if (window.matchMedia('(max-width: 700px)').matches) setDrawer(false); };
  const toggleFolder = (id: string) => setCollapsed(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
  const newNote = () => void run(async () => {
    const title = window.prompt('새 노트 이름', '제목 없음'); if (!title?.trim()) return;
    const saved = await postNoteData({ id: newWorkspaceId(), title: title.trim(),
      content: { format: 'markdown', version: 1, markdown: '' }, created_at: new Date().toISOString(), revision: 1, client_id: getSyncClientId() });
    if (activeFolder) {
      try { await addNoteToFolder(activeFolder.id, saved.id); }
      catch { openNote(saved.id); throw new Error('폴더 배치 실패'); }
      setCollapsed(ids => ids.filter(v => v !== activeFolder.id));
    }
    openNote(saved.id);
  });
  const newFolder = () => void run(async () => {
    const name = window.prompt('새 폴더 이름'); if (!name?.trim()) return;
    const category = window.prompt('카테고리', activeFolder?.category ?? ''); if (category === null) return;
    const created = await createNoteFolder({ name: name.trim(), category }); setFolderId(created.id);
  });
  const renameNote = (note: NoteSummary) => void run(async () => {
    const title = window.prompt('노트 이름 변경', note.title); if (!title?.trim() || title === note.title) return;
    if (note.id === noteId) {
      if (!renameCurrent.current) throw new Error('편집기를 불러오는 중입니다.');
      renameCurrent.current(title.trim()); return;
    }
    await updateNoteTitle(note.id, title.trim(), { revision: (note.revision ?? 0) + 1, clientId: getSyncClientId() });
  });
  const noteRow = (note: NoteSummary, parent?: NoteFolder) => <div className="note-tree-row" key={note.id}>
    <button className="note-tree-label" role="treeitem" aria-level={parent ? 3 : 2} data-parent={parent?.id} aria-selected={noteId === note.id}
      title={note.title} onClick={() => { setFolderId(parent?.id ?? ''); openNote(note.id); }}>
      <FileText size={16} /><span>{(note.title || '제목 없음').replace(/\.md$/i, '')}.md</span>
    </button>
    <details className="note-file-menu"><summary aria-label={`${note.title} 파일 동작`}>⋯</summary><div>
      <button disabled={busy} onClick={() => renameNote(note)}>이름 변경</button>
      <label>노트 이동<select aria-label={`${note.title} 이동`} value={parent?.id ?? ''} disabled={busy}
        onChange={e => { const target = e.target.value; void run(async () => {
          if (target) await addNoteToFolder(target, note.id); else if (parent) await removeNoteFromFolder(parent.id, note.id);
          if (note.id === noteId) setFolderId(target);
        }); }}>
        <option value="">미분류</option>{folders.map(f => <option key={f.id} value={f.id}>{f.category || '카테고리 없음'} / {f.name}</option>)}
      </select></label>
      <button disabled={busy} onClick={() => {
        if (window.confirm(`“${note.title}” 노트와 기기 초안을 삭제할까요?`)) void run(async () => {
          pauseNoteSave(owner, note.id); await waitForNoteSave(owner, note.id); await deleteNote(note.id); await noteDrafts.remove(owner, note.id);
          if (note.id === noteId) navigate('/blog');
        });
      }}>노트 삭제</button>
    </div></details>
  </div>;
  return <section onKeyDown={e => {
    if (e.key !== 'Escape') return;
    const menu = e.currentTarget.querySelector<HTMLDetailsElement>('.note-file-menu[open]');
    if (menu) { e.stopPropagation(); menu.open = false; menu.querySelector('summary')?.focus(); }
  }} className="note-workspace workspace-surface" data-testid="markdown-workspace" aria-label="노트 작업 공간">
    <header className="note-topbar">
      <button ref={toggle} aria-label="탐색기 토글" aria-expanded={drawer} aria-controls="note-explorer" onClick={() => setDrawer(v => !v)}><PanelLeft size={19} /></button>
      <div className="note-breadcrumb" title={[selectedFolder?.category, selectedFolder?.name, selected?.title].filter(Boolean).join(' / ')}>
        노트 / {selectedFolder ? `${selectedFolder.category || '카테고리 없음'} / ${selectedFolder.name} / ` : ''}{selected?.title ?? '작업 공간'}
      </div>
      <button onClick={newNote} disabled={busy}><Plus size={16} /><span>새 노트</span></button>
      <button onClick={newFolder} disabled={busy} aria-label="새 폴더"><FolderPlus size={18} /></button>
    </header>
    <div className="note-workspace-body">
      {drawer && <button className="note-drawer-scrim" aria-label="탐색기 닫기" onClick={() => setDrawer(false)} />}
      <aside id="note-explorer" ref={sidebar} className={`note-explorer ${drawer ? 'is-open' : ''}`} role={drawer && window.matchMedia('(max-width: 700px)').matches ? 'dialog' : 'complementary'} aria-modal={drawer && window.matchMedia('(max-width: 700px)').matches ? true : undefined} aria-label="노트 탐색기">
        <div className="note-explorer-heading"><span>탐색기</span><button aria-label="목록 새로고침" onClick={() => void refresh()}><RefreshCw size={15} /></button>
          <button className="note-mobile-close" onClick={() => setDrawer(false)}>닫기</button></div>
        {loading && <p role="status">목록 불러오는 중…</p>}
        {error && <div role="alert">{error}<button onClick={() => void refresh()}>다시 시도</button></div>}
        <div role="tree" aria-label="폴더와 노트" onKeyDown={e => {
          const target = e.target as HTMLElement;
          if (target.getAttribute('role') !== 'treeitem') return;
          const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'));
          const index = items.indexOf(target);
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault(); items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
          }
          if (e.key === 'ArrowLeft' && target.dataset.parent) {
            e.preventDefault(); e.currentTarget.querySelector<HTMLElement>(`[data-folder="${CSS.escape(target.dataset.parent)}"]`)?.focus();
          }
          const folder = target.dataset.folder;
          if (folder && ['ArrowRight', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); setCollapsed(ids => e.key === 'ArrowRight' ? ids.filter(id => id !== folder) : [...new Set([...ids, folder])]); }
        }}>
          {tree.categories.map(([category, groups]) => <div key={category} role="group" aria-label={category}>
            <button className="note-tree-category" role="treeitem" aria-level={1} data-folder={`category:${category}`} aria-expanded={!collapsed.includes(`category:${category}`)} onClick={() => toggleFolder(`category:${category}`)}>{collapsed.includes(`category:${category}`) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{category}</button>
            {!collapsed.includes(`category:${category}`) && groups.map(({ folder, notes: members }) => <div key={folder.id}>
              <div className="note-tree-row">
                <button className="note-tree-label" role="treeitem" aria-level={2} data-folder={folder.id}
                  aria-expanded={!collapsed.includes(folder.id)} aria-selected={!noteId && activeFolder?.id === folder.id}
                  onClick={() => { setFolderId(folder.id); toggleFolder(folder.id); }}>
                  {collapsed.includes(folder.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<Folder size={16} /><span title={folder.name}>{folder.name}</span>
                </button>
                <details className="note-file-menu"><summary aria-label={`${folder.name} 폴더 동작`}>⋯</summary><div>
                  <button disabled={busy} onClick={() => void run(async () => {
                    const name = window.prompt('폴더 이름 변경', folder.name); if (!name?.trim()) return;
                    const category = window.prompt('카테고리 변경', folder.category); if (category === null) return;
                    await updateNoteFolder(folder.id, { name: name.trim(), category });
                  })}>이름·카테고리 변경</button>
                  <button disabled={busy} onClick={() => {
                    if (window.confirm('폴더만 삭제할까요? 안의 노트는 미분류에 남습니다.')) void run(async () => { await deleteNoteFolder(folder.id); setFolderId(''); });
                  }}>폴더만 삭제 (노트 유지)</button>
                </div></details>
              </div>
              {!collapsed.includes(folder.id) && <div role="group" aria-label={`${folder.name} 노트`} className="note-tree-children">{members.map(n => noteRow(n, folder))}{members.length === 0 && <p className="note-tree-empty">빈 폴더</p>}</div>}
            </div>)}
          </div>)}
          <div role="group" aria-label="미분류"><div className="note-tree-category"><button onClick={() => { setFolderId(''); navigate('/blog'); }}>미분류</button></div>{tree.unfiled.map(n => noteRow(n))}</div>
        </div>
        {!loading && notes.length === 0 && !error && <p>아직 노트가 없습니다. 새 노트로 시작하세요.</p>}
      </aside>
      <main className="note-content" aria-label="문서">
        {error && <p role="alert" className="note-notice">{error}</p>}
        {noteId ? <NoteEditor key={`${owner}:${noteId}`} owner={owner} id={noteId} registerRename={registerRename} onSaved={handleSaved} /> :
          <div className="note-workspace-empty"><FileText size={32} /><h1>노트 작업 공간</h1><p>폴더에서 노트를 선택하거나 Markdown 문서를 만드세요.</p><button onClick={newNote} disabled={busy}>새 노트</button></div>}
      </main>
    </div>
  </section>;
}
