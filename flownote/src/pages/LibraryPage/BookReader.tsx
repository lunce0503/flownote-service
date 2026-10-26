import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Minus, Plus, MoreVertical, Search, Eye, EyeOff, BookOpen } from 'lucide-react';
import { bookPage, openBookPdf, readBookFile, readingCrop, type Book, type ReadingRegion, type BookChange } from '@/features/library';
import { renderTextLayer, type PDFDocumentProxy, type TextLayerRenderTask } from 'pdfjs-dist';
import ReaderDictionary from './ReaderDictionary';
import LibraryDialog from './LibraryDialog';

export default function BookReader({ book, owner, back, savePage, bookmark, change }: {
  book: Book; owner: string; back: () => void; savePage: (page: number) => Promise<void>; bookmark: (page: number) => void; change: (change: BookChange) => Promise<void>;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(book.page);
  const [region, setRegion] = useState<ReadingRegion>('page');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedPage, setSavedPage] = useState(0);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const [dictionary, setDictionary] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [textAvailable, setTextAvailable] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const renderKey = `${page}/${region}/${zoom}/${width}`;
  const ready = rendered === renderKey;

  useEffect(() => {
    if (!ready || !controls || menu || details || dictionary !== null) return;
    const timer = window.setTimeout(() => {
      if (!(document.activeElement instanceof Element) || !document.activeElement.closest('[data-reader-controls]')) setControls(false);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [ready, controls, menu, details, dictionary]);
  useEffect(() => {
    if (!menu) return;
    menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuPanel.current?.contains(event.target) && !menuTrigger.current?.contains(event.target)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuTrigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);
  useEffect(() => {
    let clear: number | undefined;
    const selected = () => {
      const value = window.getSelection();
      if (clear !== undefined) window.clearTimeout(clear);
      if (!ready || !value || value.isCollapsed || !textLayer.current?.contains(value.anchorNode) || !textLayer.current?.contains(value.focusNode)) {
        clear = window.setTimeout(() => setSelection(''), 150); return;
      }
      const word = value.toString().trim().replace(/\s+/g, ' ');
      setSelection(word && [...word].length <= 120 ? word : '');
    };
    document.addEventListener('selectionchange', selected);
    return () => { document.removeEventListener('selectionchange', selected); if (clear !== undefined) window.clearTimeout(clear); };
  }, [ready]);
  useEffect(() => {
    let active = true;
    let document: PDFDocumentProxy | undefined;
    void readBookFile(owner, book.id).then(openBookPdf).then(value => {
      document = value;
      if (active) setPdf(value); else void value.destroy();
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'PDF를 열지 못했습니다.'); });
    return () => { active = false; void document?.destroy().catch(() => {}); };
  }, [owner, book.id]);
  useEffect(() => {
    const host = scroll.current;
    if (!host) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(1, Math.floor(entries[0].contentRect.width - 24))));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let textTask: TextLayerRenderTask | undefined;
    const buffer = document.createElement('canvas');
    void (async () => {
      let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
      try {
        pdfPage = await pdf.getPage(page);
        if (!active) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const crop = readingCrop(base.width, base.height, region);
        const cssScale = width * zoom / crop.width;
        const scale = Math.min(cssScale * Math.min(window.devicePixelRatio || 1, 2), 4096 / Math.max(crop.width, crop.height));
        buffer.width = Math.max(1, Math.ceil(crop.width * scale)); buffer.height = Math.max(1, Math.ceil(crop.height * scale));
        const context = buffer.getContext('2d', { alpha: false });
        if (!context) throw new Error('페이지를 그릴 수 없습니다.');
        task = pdfPage.render({ canvasContext: context, viewport: pdfPage.getViewport({ scale }), transform: [1, 0, 0, 1, -crop.x * scale, -crop.y * scale] });
        await task.promise;
        const textContent = await pdfPage.getTextContent();
        const textBuffer = document.createElement('div');
        const textViewport = pdfPage.getViewport({ scale: cssScale });
        textTask = renderTextLayer({ textContentSource: textContent, container: textBuffer, viewport: textViewport, textDivs: [] });
        await textTask.promise;
        const target = canvas.current;
        if (!active || !target) return;
        target.width = buffer.width; target.height = buffer.height;
        target.style.width = `${Math.round(crop.width * cssScale)}px`;
        target.style.height = `${Math.round(crop.height * cssScale)}px`;
        target.getContext('2d')?.drawImage(buffer, 0, 0);
        const layer = textLayer.current;
        if (layer) {
          layer.replaceChildren(...textBuffer.childNodes);
          layer.style.width = `${textViewport.width}px`; layer.style.height = `${textViewport.height}px`;
          layer.style.left = `${-crop.x * cssScale}px`; layer.style.top = `${-crop.y * cssScale}px`;
          layer.style.setProperty('--scale-factor', String(cssScale));
        }
        setTextAvailable(textContent.items.some(item => 'str' in item && item.str.trim()));
        setSelection('');
        scroll.current?.scrollTo({ left: 0, top: 0 });
        setRendered(renderKey); setError('');
        void savePage(page).then(() => { if (active) { setSaveError(''); setSavedPage(page); } }).catch(() => {
          if (active) setSaveError('읽던 위치를 저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.');
        });
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '페이지를 표시하지 못했습니다.'); }
      finally { pdfPage?.cleanup(); buffer.width = buffer.height = 0; }
    })();
    return () => { active = false; task?.cancel(); textTask?.cancel(); };
  }, [pdf, width, page, region, zoom, renderKey, savePage]);

  return <section className="book-reader" aria-label={`${book.title} 읽기`}>
    <button ref={menuTrigger} className="reader-more-trigger" aria-label="읽기 메뉴" aria-expanded={menu} onClick={() => setMenu(value => !value)}><MoreVertical size={20} /></button>
    {menu && <div ref={menuPanel} className="reader-overflow-menu" role="menu" aria-label="읽기 메뉴 항목" onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      <button role="menuitem" onClick={() => { setControls(value => !value); setMenu(false); }}>{controls ? <EyeOff size={17} /> : <Eye size={17} />}{controls ? '읽기 도구 숨기기' : '읽기 도구 표시'}</button>
      <button role="menuitem" onClick={() => { setDetails(true); setMenu(false); }}>책 제목·분야 수정</button>
      <button role="menuitem" onClick={() => { setDictionary(''); setMenu(false); }}><BookOpen size={17} />사전·단어장</button>
      <button role="menuitem" onClick={() => { setMenu(false); back(); }}>표지로 돌아가기</button>
    </div>}
    {controls && <div data-reader-controls="true"><header className="library-reader-heading">
      <button onClick={back}><ArrowLeft size={18} />표지로</button>
      <h1 title={book.title}>{book.title}</h1>
      <button aria-label="현재 페이지 책갈피" aria-pressed={book.bookmarks.includes(page)} onClick={() => bookmark(page)}><Bookmark size={18} />책갈피</button>
    </header>
    <div className="book-reader-tools" aria-label="읽기 도구">
      <label>보기 <select aria-label="페이지 보기" value={region} onChange={event => setRegion(event.target.value as ReadingRegion)}>
        <option value="page">전체 페이지</option><option value="trim">여백 줄이기</option><option value="left">왼쪽 단 집중</option><option value="right">오른쪽 단 집중</option>
      </select></label>
      <div className="library-zoom"><button aria-label="축소" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><Minus size={17} /></button>
        <button onClick={() => setZoom(1)}>폭 맞춤 {Math.round(zoom * 100)}%</button>
        <button aria-label="확대" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><Plus size={17} /></button></div>
      <form onSubmit={event => { event.preventDefault(); const n = Number(new FormData(event.currentTarget).get('page')); setPage(bookPage(n, book.pages)); }}>
        <label>페이지 <input aria-label="이동할 페이지" name="page" key={page} defaultValue={page} type="number" min={1} max={book.pages} required /></label><button>이동</button>
      </form>
    </div>
    {book.bookmarks.length > 0 && <nav className="book-page-marks" aria-label="페이지 책갈피 목록">{book.bookmarks.map(mark => <button key={mark} aria-current={page === mark ? 'page' : undefined} onClick={() => setPage(mark)}><Bookmark size={13} />{mark}쪽</button>)}</nav>}
    </div>}
    <div role="status" className="library-reader-status">{error || saveError || (!ready ? '페이지를 준비하고 있습니다…' : `${page} / ${book.pages}쪽 · ${savedPage === page ? '읽던 위치 저장됨' : '읽던 위치 저장 중…'}`)}</div>
    <div className="book-page-scroll" ref={scroll} tabIndex={0} aria-label="PDF 페이지 확대 영역"
      onScroll={() => { if (!window.getSelection()?.toString()) setControls(false); }}
      onPointerDown={event => { touchStart.current = { x: event.clientX, y: event.clientY }; }}
      onPointerUp={event => {
        const start = touchStart.current; touchStart.current = null;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5 && !window.getSelection()?.toString()) { setControls(value => !value); setSelection(''); }
      }} onKeyDown={event => {
      if (!ready || !window.getSelection()?.isCollapsed) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setPage(current => bookPage(current + (event.key === 'ArrowRight' ? 1 : -1), book.pages)); }
    }}>
      <div className="library-page-frame" style={{ visibility: ready ? 'visible' : 'hidden' }}><canvas ref={canvas} role="img" aria-label={`${page}쪽 PDF 원본 페이지`} data-testid="library-pdf-page" data-page={ready ? page : undefined} style={{ visibility: ready ? 'visible' : 'hidden' }} /><div ref={textLayer} className="library-text-layer" data-testid="library-pdf-text" aria-label="선택 가능한 PDF 텍스트" /></div>
    </div>
    {!textAvailable && <p className="library-reader-status">선택 가능한 텍스트가 없는 페이지입니다. 읽기 메뉴의 사전에서 직접 단어를 검색할 수 있습니다.</p>}
    {selection && <button className="reader-selection-action" onMouseDown={event => event.preventDefault()} onClick={() => setDictionary(selection)}><Search size={16} />“{selection.slice(0, 24)}” 사전 검색</button>}
    {controls && <footer data-reader-controls="true" className="book-reader-footer"><button aria-label="이전 페이지" aria-disabled={!ready || page <= 1} onClick={() => { if (ready) setPage(current => bookPage(current - 1, book.pages)); }}><ChevronLeft size={20} />이전</button>
      <span>{page} / {book.pages}</span><button aria-label="다음 페이지" aria-disabled={!ready || page >= book.pages} onClick={() => { if (ready) setPage(current => bookPage(current + 1, book.pages)); }}>다음<ChevronRight size={20} /></button></footer>}
    {dictionary !== null && <ReaderDictionary key={`${page}:${dictionary}`} owner={owner} book={book} page={page} initialTerm={dictionary} close={() => { setDictionary(null); setSelection(''); window.getSelection()?.removeAllRanges(); window.setTimeout(() => menuTrigger.current?.focus(), 0); }} />}
    {details && <LibraryDialog title="책 세부 정보 수정" close={() => setDetails(false)}><form className="library-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void change({ type: 'details', title: String(data.get('title')), subject: String(data.get('subject')) })
        .then(() => setDetails(false)).catch(failure => setSaveError(String(failure)));
    }}><label>책 제목<input name="title" defaultValue={book.title} maxLength={160} required /></label>
      <label>분야 / 칸막이<input name="subject" defaultValue={book.subject} maxLength={40} required /></label><button>제목·분야 저장</button>
      {saveError && <p role="alert">{saveError}</p>}</form></LibraryDialog>}
  </section>;
}
