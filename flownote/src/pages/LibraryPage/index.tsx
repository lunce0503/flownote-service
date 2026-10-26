import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Bookmark, ChevronRight, Download, Library, Plus, Search, Star, RefreshCw } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { addBook, bookSubject, bookTitle, changeBook, defaultSubjects, deleteBook, inspectBook, listBooks, readBookFile, type Book, type BookChange, syncLibrary, type LibrarySyncStatus } from '@/features/library';
import { downloadBlob } from '@/shared/lib/downloadBlob';
import { isDeviceOnly } from '@/shared/lib/deviceMode';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import BookReader from './BookReader';
import Modal from './LibraryDialog';
import './library.css';

function AddBook({ owner, subjects, close, added }: { owner: string; subjects: string[]; close: () => void; added: (book: Book) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('pdf');
    if (!(file instanceof File)) return;
    setBusy(true); setError('');
    try {
      const { pages, cover } = await inspectBook(file);
      if (!alive.current) return;
      const book: Book = { id: crypto.randomUUID(), title: bookTitle(String(data.get('title') || ''), file.name),
        subject: bookSubject(String(data.get('subject') || '')), pages, page: 1, bookmarks: [], favorite: false,
        filename: file.name, bytes: file.size, cover, createdAt: new Date().toISOString() };
      await addBook(owner, book, file);
      if (alive.current) added(book);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '책을 추가하지 못했습니다.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <Modal title="책장에 책 꽂기" close={() => { if (!busy) close(); }}>
    <form onSubmit={event => { void submit(event); }} className="library-form">
      <p className="library-muted">PDF 첫 페이지로 표지를 만듭니다. 제목과 분야는 나중에 바꿀 수 있어요.</p>
      <label>PDF 파일<input name="pdf" type="file" accept="application/pdf,.pdf" required disabled={busy} /></label>
      <label>책 제목<input name="title" maxLength={160} placeholder="예: 미적분학 — 제목을 직접 적어 주세요" disabled={busy} /></label>
      <label>분야 / 칸막이<input name="subject" list="book-subjects" maxLength={40} placeholder="예: 수학 · 해석학" disabled={busy} /></label>
      <datalist id="book-subjects">{subjects.map(subject => <option key={subject} value={subject} />)}</datalist>
      <p className="library-muted">100MiB 이하 · {isDeviceOnly() ? '동기화 꺼짐 — 이 기기에 저장합니다.' : '기기에 먼저 보관한 뒤 클라우드에 저장합니다. 업로드 후 같은 계정의 다른 기기에서도 볼 수 있어요.'} 원본 PDF도 보관해 주세요.</p>
      {error && <p role="alert">{error}</p>}
      <button className="library-primary" disabled={busy}>{busy ? '표지를 만들고 저장하는 중…' : '책장에 추가'}</button>
    </form>
  </Modal>;
}

function BookCover({ book, owner, close, read, change, remove }: { book: Book; owner: string; close: () => void; read: () => void; change: (change: BookChange) => Promise<void>; remove: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <Modal title="책 펼쳐 보기" close={close}>
    <div className="library-cover-layout">
      <div className="library-cover-art"><img src={book.cover} alt={`${book.title} PDF 첫 페이지 표지`} /><span>PDF 첫 페이지</span></div>
      <div className="library-cover-info"><p className="library-eyebrow">{book.subject}</p><h3>{book.title}</h3>
        <p className="library-muted">{book.pages}쪽 · {(book.bytes / 1024 / 1024).toFixed(1)}MiB</p>
        <p className="library-muted" role="status">{isDeviceOnly() ? '동기화 꺼짐 · 이 기기에 보관' : book.syncError || (!book.cloudRevision ? '클라우드에 원본을 저장하는 중 · 기기 원본은 보관했습니다.' : book.dirty ? '읽기 기록·책 정보를 동기화하는 중' : '클라우드 저장 완료 · 다른 기기에서도 열 수 있어요.')}</p>
        <p>{book.page > 1 ? `${book.page}쪽에서 기다리고 있어요.` : '표지를 넘기고 첫 장을 시작하세요.'}</p>
        <button className="library-primary" onClick={read}><BookOpen size={18} />{book.page > 1 ? `${book.page}쪽부터 이어 읽기` : '책 읽기'}<ChevronRight size={18} /></button>
        <button aria-pressed={book.favorite} onClick={() => { void action(() => change({ type: 'favorite' })); }} disabled={busy}><Star size={17} />{book.favorite ? '즐겨찾기 해제' : '즐겨찾기'}</button>
        <button disabled={busy} onClick={() => { void action(async () => { const file = await readBookFile(owner, book.id); await downloadBlob(book.filename, file); }); }}><Download size={17} />원본 PDF 내보내기</button>
      </div>
    </div>
    <form className="library-form library-details-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void action(() => change({ type: 'details', title: String(data.get('title')), subject: String(data.get('subject')) }));
    }}>
      <label>책 제목<input name="title" defaultValue={book.title} required maxLength={160} /></label>
      <label>분야 / 칸막이<input name="subject" defaultValue={book.subject} required maxLength={40} /></label>
      <button disabled={busy}>제목·분야 저장</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <button className="library-delete" disabled={busy} onClick={() => {
      if (window.confirm(`“${book.title}”을 모든 기기의 책장에서 삭제할까요? PDF와 읽기 기록이 함께 삭제됩니다. 원본이 없다면 먼저 내보내 주세요.`)) void action(remove);
    }}>책장에서 삭제</button>
  </Modal>;
}

function Bookshelf({ owner }: { owner: string }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [sync, setSync] = useState<LibrarySyncStatus>({ owner, message: isDeviceOnly() ? '동기화 꺼짐 · 이 기기에 보관' : '책장 동기화 준비 중…', busy: false, error: false });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [reading, setReading] = useState(false);
  const selected = books.find(book => book.id === selectedId);
  useDocumentTitle('책장', selected?.title);
  useEffect(() => {
    let active = true;
    const load = () => { void listBooks(owner).then(result => { if (active) { setBooks(result); setLoaded(true); setError(''); } }).catch(failure => {
      if (active) { setError(failure instanceof Error ? failure.message : '책장을 불러오지 못했습니다.'); setLoaded(true); }
    }); };
    const onSync = (event: Event) => { const detail = (event as CustomEvent<LibrarySyncStatus>).detail; if (active && detail.owner === owner) setSync(detail); };
    const focus = () => { load(); void syncLibrary(owner, true).catch(() => {}); };
    window.addEventListener('flownote-library-sync', onSync);
    load(); window.addEventListener('focus', focus); window.addEventListener('flownote-library-changed', load);
    const timer = window.setInterval(() => { if (!document.hidden) void syncLibrary(owner).catch(() => {}); }, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('flownote-library-changed', load); window.removeEventListener('flownote-library-sync', onSync); };
  }, [owner]);
  const change = useCallback(async (id: string, update: BookChange) => {
    const book = await changeBook(owner, id, update);
    setBooks(current => current.map(item => item.id === id ? book : item));
  }, [owner]);
  const savePage = useCallback((page: number) => change(selectedId, { type: 'page', page }), [change, selectedId]);
  const subjects = [...new Set([...defaultSubjects, ...books.map(book => book.subject)])];
  const filtered = books.filter(book => (!subject || book.subject === subject) && (!onlyFavorites || book.favorite)
    && `${book.title} ${book.subject}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const shelfSubjects = [...new Set(filtered.map(book => book.subject))];
  if (reading && selected) return <div className="workspace-surface textbook-library"><BookReader key={selectedId} book={selected} owner={owner} back={() => setReading(false)} savePage={savePage}
    change={update => change(selected.id, update)} bookmark={page => { void change(selected.id, { type: 'bookmark', page }).catch(failure => setError(String(failure))); }} />{error && <p role="alert">{error}</p>}</div>;

  return <main className="workspace-surface textbook-library">
    <div className="library-shell">
      <aside className="library-sidebar" aria-label="책장 분류">
        <div className="library-brand"><Library size={24} /><span>나의 서재<small>FLOWNOTE LIBRARY</small></span></div>
        <nav><button aria-pressed={!subject && !onlyFavorites} onClick={() => { setSubject(''); setOnlyFavorites(false); }}><BookOpen size={17} />모든 책<span>{books.length}</span></button>
          <button aria-pressed={onlyFavorites} onClick={() => { setOnlyFavorites(value => !value); setSubject(''); }}><Star size={17} />즐겨찾는 책<span>{books.filter(book => book.favorite).length}</span></button></nav>
        <p className="library-eyebrow">분야별 칸막이</p>
        <nav>{subjects.map(item => <button key={item} aria-pressed={subject === item} onClick={() => { setSubject(item); setOnlyFavorites(false); }}><span className="library-divider-icon" />{item}<span>{books.filter(book => book.subject === item).length}</span></button>)}</nav>
        <p className="library-storage-note">PDF와 읽기 기록을 같은 계정의 기기에서 이어 봅니다. 동기화를 끄면 이 기기에 보관합니다.</p>
      </aside>
      <section className="library-main" aria-label="전공서 책장">
        <header className="library-heading"><div><p className="library-eyebrow">A PLACE FOR YOUR CURIOSITY</p><h1>{onlyFavorites ? '즐겨찾는 책' : subject || '전공서 책장'}</h1><p className="library-muted">한 권씩 꽂아 두고, 궁금한 순간에 펼쳐 보세요.</p></div>
          <button className="library-primary" onClick={() => setAdding(true)}><Plus size={18} />책 추가</button></header>
        <div className="library-toolbar"><label className="library-search"><Search size={17} /><input aria-label="책 제목 또는 분야 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="제목이나 분야로 책 찾기" /></label><span>{filtered.length}권의 책</span></div><div className="library-sync-status" role={sync.error ? 'alert' : 'status'}><span>{sync.message}</span><button aria-label="책장 동기화 다시 시도" disabled={sync.busy || isDeviceOnly()} onClick={() => { void syncLibrary(owner, true).catch(() => {}); }}><RefreshCw size={15} />동기화</button></div>
        {error && <div role="alert">{error}<button onClick={() => { void listBooks(owner).then(setBooks).then(() => setError('')).catch(failure => setError(String(failure))); }}>다시 시도</button></div>}
        {!loaded ? <p role="status">책장을 불러오고 있습니다…</p> : filtered.length === 0 ? <section className="library-empty"><div className="library-empty-books" aria-hidden="true"><i /><i /><i /></div>
          <h2>{books.length ? '이 칸은 아직 비어 있어요' : '당신의 첫 전공서를 꽂아 보세요'}</h2><p>{books.length ? '다른 분야를 고르거나 검색어를 바꿔 보세요.' : '수학의 한 정리, 과학의 새로운 질문. PDF 한 권에서 시작해 보세요.'}</p>
          <button onClick={() => setAdding(true)}><Plus size={17} />PDF로 책 추가</button></section> : shelfSubjects.map((item, shelfIndex) => <section key={item} className="library-shelf" aria-label={`${item} 선반`}>
          <header><span className="library-shelf-number">{String(shelfIndex + 1).padStart(2, '0')}</span><h2>{item}</h2><span>{filtered.filter(book => book.subject === item).length}권</span></header>
          <div className="library-book-row"><div className="library-shelf-divider" aria-hidden="true">{item}</div>{filtered.filter(book => book.subject === item).map((book, index) => <button key={book.id} className={`library-spine library-spine-${index % 5}`} title={`${book.title} · ${book.pages}쪽`} aria-label={`${book.title} 표지 보기`} onClick={() => setSelectedId(book.id)}>
            <span className="library-spine-top">{book.favorite ? <Star size={14} fill="currentColor" /> : <BookOpen size={14} />}</span><span className="library-spine-title">{book.title}</span>
            <span className="library-spine-bottom">{book.bookmarks.length ? <Bookmark size={13} /> : String(index + 1).padStart(2, '0')}</span>
          </button>)}</div>
        </section>)}
        <footer className="library-bottom-note">읽던 곳은 기억하고, 책의 모양은 그대로.<span>클라우드 연결 · 기기에 원본 보관</span></footer>
      </section>
    </div>
    {adding && <AddBook owner={owner} subjects={subjects} close={() => setAdding(false)} added={book => { setBooks(current => [...current.filter(item => item.id !== book.id), book]); setAdding(false); setSelectedId(book.id); }} />}
    {selected && <BookCover key={selected.id} owner={owner} book={selected} close={() => setSelectedId('')} read={() => setReading(true)} change={update => change(selected.id, update)} remove={async () => { await deleteBook(owner, selected.id); setBooks(current => current.filter(book => book.id !== selected.id)); setSelectedId(''); }} />}
  </main>;
}

export default function LibraryPage() {
  const { user } = useAuth();
  return user ? <Bookshelf key={user.id} owner={user.id} /> : null;
}
