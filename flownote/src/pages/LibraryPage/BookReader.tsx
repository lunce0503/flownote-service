import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Minus, Plus, MoreVertical, Search, Eye, EyeOff, BookOpen, Columns2, File, SlidersHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { bookPage, openBookPdf, readBookFile, readerPages, stepReaderPage, createWheelPager, swipePageDirection, type Book, type ReadingRegion, type BookChange, type ReaderLayout } from '@/features/library';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ReaderDictionary from './ReaderDictionary';
import LibraryDialog from './LibraryDialog';
import ReaderPage from './ReaderPage';

const selectedText = () => Boolean(window.getSelection()?.toString().trim());
const editableTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,button,a,[contenteditable=true],[role=dialog],[role=menu]');
export default function BookReader({ book, owner, back, savePage, bookmark, change }: {
  book: Book; owner: string; back: () => void; savePage: (page: number) => Promise<void>; bookmark: (page: number) => void; change: (change: BookChange) => Promise<void>;
}) {
  const preference = `flownote.reader-layout:${owner}:${book.id}`;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [page, setPage] = useState(book.page);
  const [layout, setLayout] = useState<ReaderLayout>(() => { try { return localStorage.getItem(preference) === 'spread' ? 'spread' : 'single'; } catch { return 'single'; } });
  const [region, setRegion] = useState<ReadingRegion>('page'), [zoom, setZoom] = useState(1), [width, setWidth] = useState(0);
  const [readyPages, setReadyPages] = useState<{ key: string; pages: number[] }>({ key: '', pages: [] });
  const [renderError, setRenderError] = useState({ key: '', message: '' }), [error, setError] = useState(''), [saveError, setSaveError] = useState(''), [savedPage, setSavedPage] = useState(0);
  const [controls, setControls] = useState(true), [menu, setMenu] = useState(false), [details, setDetails] = useState(false), [settings, setSettings] = useState(false);
  const [dictionary, setDictionary] = useState<{ term: string; page: number } | null>(null), [selection, setSelection] = useState<{ term: string; page: number } | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null), menuPanel = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), reader = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const [wheelPager] = useState(createWheelPager);
  const lastTouch = useRef(-Infinity);
  const touch = useRef<{ x: number; y: number; at: number; max: number } | null>(null), contacts = useRef(new Set<number>());
  const pages = useMemo(() => readerPages(page, book.pages, layout), [page, book.pages, layout]);
  const cellWidth = Math.max(1, (width - (layout === 'spread' ? 16 : 0)) / (layout === 'spread' ? 2 : 1));
  const renderKey = `${pages.join(',')}/${layout}/${region}/${zoom}/${width}`;
  const ready = readyPages.key === renderKey && pages.every(n => readyPages.pages.includes(n));
  const hasDialog = menu || details || settings || dictionary !== null;
  const range = pages.length > 1 ? `${pages[0]}–${pages.at(-1)}` : String(pages[0]);
  const onReady = useCallback((n: number, key: string) => setReadyPages(current => current.key === key
    ? current.pages.includes(n) ? current : { key, pages: [...current.pages, n] } : { key, pages: [n] }), []);
  const onError = useCallback((key: string, message: string) => setRenderError({ key, message }), []);
  const setSpread = (next: ReaderLayout) => { setLayout(next); try { localStorage.setItem(preference, next); } catch { /* Reading continues without preference persistence. */ } };
  const turn = useCallback((direction: number) => {
    if (!ready || hasDialog || selectedText() || contacts.current.size) return;
    const next = stepReaderPage(page, book.pages, layout, direction);
    if (next === page) return;
    setSelection(null); setPage(next); setControls(false);
  }, [ready, hasDialog, page, book.pages, layout]);
  useEffect(() => {
    let active = true, document: PDFDocumentProxy | undefined;
    void readBookFile(owner, book.id).then(openBookPdf).then(value => {
      document = value; if (active) setPdf(value); else void value.destroy();
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'PDF를 열지 못했습니다.'); });
    return () => { active = false; void document?.destroy().catch(() => {}); };
  }, [owner, book.id]);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(1, Math.floor(entries[0].contentRect.width - 24))));
    observer.observe(scroll.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const host = reader.current, tools = toolbar.current;
    if (!host || !tools) return;
    const measure = () => host.style.setProperty('--reader-toolbar-height', `${tools.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure(); observer.observe(tools);
    return () => observer.disconnect();
  }, [controls]);
  useEffect(() => { scroll.current?.scrollTo({ left: 0, top: 0 }); window.getSelection()?.removeAllRanges(); }, [renderKey]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void savePage(page).then(() => { if (active) { setSaveError(''); setSavedPage(page); } })
      .catch(() => { if (active) setSaveError('읽던 위치를 저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.'); });
    return () => { active = false; };
  }, [ready, page, savePage]);
  useEffect(() => {
    if (!ready || !controls || hasDialog || selection || contacts.current.size) return;
    const timer = window.setTimeout(() => { if (!contacts.current.size && !selectedText() && !reader.current?.querySelector('[data-reader-controls] :focus')) setControls(false); }, 3200);
    return () => window.clearTimeout(timer);
  }, [ready, controls, hasDialog, selection]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (hasDialog || editableTarget(event.target) || selectedText() || event.ctrlKey || event.metaKey || event.altKey) return;
      const direction = event.code === 'Space' || event.key === ' ' ? event.shiftKey ? -1 : 1
        : ['ArrowRight', 'PageDown'].includes(event.key) ? 1 : ['ArrowLeft', 'PageUp'].includes(event.key) ? -1 : 0;
      if (direction) { event.preventDefault(); if (!event.repeat) turn(direction); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [turn, hasDialog]);
  useEffect(() => {
    const host = scroll.current; if (!host) return;
    const wheel = wheelPager;
    const handler = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || hasDialog || selectedText() || contacts.current.size) { wheel.reset(); return; }
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = (horizontal ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1);
      const position = horizontal ? host.scrollLeft : host.scrollTop;
      const limit = horizontal ? host.scrollWidth - host.clientWidth : host.scrollHeight - host.clientHeight;
      const now = performance.now();
      if (wheel.isLatched(now)) { event.preventDefault(); wheel.move(delta, now, false); return; }
      if ((delta > 0 && position < limit - 2) || (delta < 0 && position > 2)) { wheel.move(delta, now, false); setControls(false); return; }
      event.preventDefault();
      const direction = wheel.move(delta, now);
      if (direction) turn(direction);
    };
    host.addEventListener('wheel', handler, { passive: false }); return () => host.removeEventListener('wheel', handler);
  }, [turn, hasDialog, wheelPager]);
  useEffect(() => {
    let clear: number | undefined;
    const selected = () => {
      if (clear !== undefined) window.clearTimeout(clear);
      const value = window.getSelection();
      const anchor = value?.anchorNode instanceof Element ? value.anchorNode : value?.anchorNode?.parentElement;
      const focus = value?.focusNode instanceof Element ? value.focusNode : value?.focusNode?.parentElement;
      const first = anchor?.closest<HTMLElement>('[data-reader-page]'), last = focus?.closest<HTMLElement>('[data-reader-page]');
      if (!ready || !value || value.isCollapsed || !anchor?.closest('.library-text-layer') || !focus?.closest('.library-text-layer') || !first || !last || !scroll.current?.contains(first) || !scroll.current.contains(last)) {
        clear = window.setTimeout(() => setSelection(null), 150); return;
      }
      const term = value.toString().trim().replace(/\s+/g, ' ');
      setSelection(term && [...term].length <= 120 ? { term, page: Number(first.dataset.readerPage) } : null);
    };
    document.addEventListener('selectionchange', selected); return () => { document.removeEventListener('selectionchange', selected); if (clear !== undefined) window.clearTimeout(clear); };
  }, [ready]);
  useEffect(() => {
    if (!menu) return;
    menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menuPanel.current?.contains(event.target) && !menuTrigger.current?.contains(event.target)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuTrigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);
  const pointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch' || editableTarget(event.target)) return;
    contacts.current.add(event.pointerId);
    if (!touch.current) touch.current = { x: event.clientX, y: event.clientY, at: performance.now(), max: contacts.current.size };
    else touch.current.max = Math.max(touch.current.max, contacts.current.size);
  };
  const pointerEnd = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch') return;
    lastTouch.current = performance.now();
    contacts.current.delete(event.pointerId);
    const start = touch.current;
    if (contacts.current.size || !start) return;
    touch.current = null;
    if (event.type === 'pointercancel') return;
    const direction = swipePageDirection({ dx: event.clientX - start.x, dy: event.clientY - start.y, duration: performance.now() - start.at, contacts: start.max, zoom, selected: selectedText() });
    if (direction) turn(direction);
    else if (start.max === 1 && performance.now() - start.at < 350 && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6 && !selectedText()) setControls(value => !value);
  };
  return <section ref={reader} className={`book-reader reader-immersive ${controls ? 'reader-controls-open' : ''}`} aria-label={`${book.title} 읽기`} data-layout={layout}>
    <button ref={menuTrigger} className="reader-more-trigger" aria-label="읽기 메뉴" aria-expanded={menu} onClick={() => setMenu(value => !value)}><MoreVertical size={20} /></button>
    {menu && <div ref={menuPanel} className="reader-overflow-menu" role="menu" aria-label="읽기 메뉴 항목" onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')), index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      <button role="menuitem" onClick={() => { setControls(value => !value); setMenu(false); }}>{controls ? <EyeOff size={17} /> : <Eye size={17} />}{controls ? '읽기 도구 숨기기' : '읽기 도구 표시'}</button>
      <button role="menuitem" onClick={() => { setSettings(true); setMenu(false); }}><SlidersHorizontal size={17} />읽기 설정</button>
      <button role="menuitem" onClick={() => { setDetails(true); setMenu(false); }}>책 제목·분야 수정</button>
      <button role="menuitem" onClick={() => { setDictionary({ term: '', page }); setMenu(false); }}><BookOpen size={17} />사전·단어장</button>
      <button role="menuitem" onClick={() => { setMenu(false); back(); }}>표지로 돌아가기</button>
    </div>}
    {controls && <header data-reader-controls="true" className="reader-floating-header">
      <button onClick={back} aria-label="표지로"><ArrowLeft size={18} /><span>표지로</span></button>
      <h1 title={book.title}>{book.title}</h1>
      <div className="reader-layout-switch" role="group" aria-label="페이지 배치">
        <button aria-label="한 쪽 보기" aria-pressed={layout === 'single'} onClick={() => setSpread('single')}><File size={18} /><span>한 쪽</span></button>
        <button aria-label="두 쪽 보기" aria-pressed={layout === 'spread'} onClick={() => setSpread('spread')}><Columns2 size={18} /><span>두 쪽</span></button>
      </div>
      <button aria-label="현재 페이지 책갈피" aria-pressed={book.bookmarks.includes(page)} onClick={() => bookmark(page)}><Bookmark size={18} /></button>
    </header>}
    <div className="book-page-scroll" ref={scroll} tabIndex={0} aria-label="PDF 페이지 확대 영역" data-testid="library-reader-viewport" style={{ touchAction: zoom > 1 ? 'pan-x pan-y pinch-zoom' : 'pan-y pinch-zoom' }}
      onPointerDown={pointerDown} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onClick={event => { if (performance.now() - lastTouch.current > 700 && event.detail === 1 && !(event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') && !selectedText() && event.target instanceof Element && !event.target.closest('button,input,a,select')) setControls(value => !value); }}
      onScroll={() => { if (!selectedText()) setControls(false); }}>
      <div className={`reader-spread reader-spread-${layout}`} style={{ width: Math.round(cellWidth * zoom) * (layout === 'spread' ? 2 : 1) + (layout === 'spread' ? 16 : 0) }} aria-busy={!ready}>
        {pdf && width > 0 && pages.map(n => <ReaderPage key={n} pdf={pdf} page={n} width={cellWidth} zoom={zoom} region={region} renderKey={renderKey} onReady={onReady} onError={onError} />)}
        {layout === 'spread' && pages.length === 1 && <div className="reader-blank-sheet" aria-hidden="true" />}
      </div>
    </div>
    {(error || saveError || renderError.key === renderKey) && <p role="alert" className="reader-error">{error || saveError || renderError.message}</p>}
    {!ready && !error && <div className="reader-loading" role="status">페이지를 준비하고 있습니다…</div>}
    {controls && <footer ref={toolbar} data-reader-controls="true" className="reader-floating-toolbar">
      <button aria-label="이전 페이지" disabled={!ready || pages[0] <= 1} aria-disabled={!ready || pages[0] <= 1} onClick={() => turn(-1)} title="Shift+Space"><ChevronLeft size={20} /></button>
      <form onSubmit={event => { event.preventDefault(); setPage(bookPage(Number(new FormData(event.currentTarget).get('page')), book.pages)); }}>
        <input aria-label="이동할 페이지" name="page" type="number" min={1} max={book.pages} defaultValue={page} key={page} required /><span>/ {book.pages}</span><button>이동</button>
      </form>
      <button aria-label="다음 페이지" disabled={!ready || pages.at(-1)! >= book.pages} aria-disabled={!ready || pages.at(-1)! >= book.pages} onClick={() => turn(1)} title="Space"><ChevronRight size={20} /></button>
      <span className="reader-toolbar-divider" />
      <button aria-label="축소" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><Minus size={16} /></button>
      <button aria-label="폭 맞춤" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button aria-label="확대" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><Plus size={16} /></button>
      <button aria-label="읽기 설정" onClick={() => setSettings(true)}><SlidersHorizontal size={18} /></button>
    </footer>}
    <div className="reader-progress-dock"><span role="status" aria-label="현재 읽기 위치">{range} / {book.pages}쪽{ready ? savedPage === page ? ' · 저장됨' : '' : ' · 불러오는 중'}</span>
      <button aria-label={controls ? '읽기 도구 숨기기' : '읽기 도구 표시'} aria-expanded={controls} onClick={() => setControls(value => !value)}>{controls ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      <span className="reader-progress-line" role="progressbar" aria-label="책 읽기 진행률" aria-valuemin={1} aria-valuemax={book.pages} aria-valuenow={page} style={{ '--reader-progress': `${page / book.pages * 100}%` } as React.CSSProperties} />
    </div>
    {selection && <button className="reader-selection-action" onMouseDown={event => event.preventDefault()} onClick={() => setDictionary(selection)}><Search size={16} />“{selection.term.slice(0, 24)}” 사전 검색</button>}
    {dictionary && <ReaderDictionary key={`${dictionary.page}:${dictionary.term}`} owner={owner} book={book} page={dictionary.page} initialTerm={dictionary.term} close={() => { setDictionary(null); setSelection(null); window.getSelection()?.removeAllRanges(); window.setTimeout(() => menuTrigger.current?.focus(), 0); }} />}
    {settings && <LibraryDialog title="읽기 설정" close={() => setSettings(false)}><div className="reader-settings">
      <label>페이지 배치<select aria-label="페이지 배치 설정" value={layout} onChange={event => setSpread(event.target.value as ReaderLayout)}><option value="single">한 쪽 보기</option><option value="spread">두 쪽 보기</option></select></label>
      <label>페이지 보기<select aria-label="페이지 보기" value={region} onChange={event => setRegion(event.target.value as ReadingRegion)}><option value="page">전체 페이지</option><option value="trim">여백 줄이기</option><option value="left">왼쪽 단 집중</option><option value="right">오른쪽 단 집중</option></select></label>
      <p>마우스 휠 · Space로 다음 쪽 · Shift+Space로 이전 쪽 · 손가락으로 좌우 넘기기</p><p>확대하면 페이지 안에서 먼저 스크롤합니다. 두 손가락 확대와 글자 선택 중에는 페이지를 넘기지 않습니다.</p>
      {book.bookmarks.length > 0 && <nav className="book-page-marks" aria-label="페이지 책갈피 목록">{book.bookmarks.map(n => <button key={n} onClick={() => { setPage(n); setSettings(false); }}>{n}쪽</button>)}</nav>}
      <button className="library-primary" onClick={() => setSettings(false)}>읽기 계속</button>
    </div></LibraryDialog>}
    {details && <LibraryDialog title="책 세부 정보 수정" close={() => setDetails(false)}><form className="library-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void change({ type: 'details', title: String(data.get('title')), subject: String(data.get('subject')) }).then(() => setDetails(false)).catch(failure => setSaveError(String(failure)));
    }}><label>책 제목<input name="title" defaultValue={book.title} maxLength={160} required /></label><label>분야 / 칸막이<input name="subject" defaultValue={book.subject} maxLength={40} required /></label><button>제목·분야 저장</button>{saveError && <p role="alert">{saveError}</p>}</form></LibraryDialog>}
  </section>;
}
