import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { bookPage, openBookPdf, readBookFile, readingCrop, type Book, type ReadingRegion } from '@/features/library';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export default function BookReader({ book, owner, back, savePage, bookmark }: {
  book: Book; owner: string; back: () => void; savePage: (page: number) => Promise<void>; bookmark: (page: number) => void;
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const renderKey = `${page}/${region}/${zoom}/${width}`;
  const ready = rendered === renderKey;

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
        const target = canvas.current;
        if (!active || !target) return;
        target.width = buffer.width; target.height = buffer.height;
        target.style.width = `${Math.round(crop.width * cssScale)}px`;
        target.style.height = `${Math.round(crop.height * cssScale)}px`;
        target.getContext('2d')?.drawImage(buffer, 0, 0);
        scroll.current?.scrollTo({ left: 0, top: 0 });
        setRendered(renderKey); setError('');
        void savePage(page).then(() => { if (active) { setSaveError(''); setSavedPage(page); } }).catch(() => {
          if (active) setSaveError('읽던 위치를 저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.');
        });
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '페이지를 표시하지 못했습니다.'); }
      finally { pdfPage?.cleanup(); buffer.width = buffer.height = 0; }
    })();
    return () => { active = false; task?.cancel(); };
  }, [pdf, width, page, region, zoom, renderKey, savePage]);

  return <section className="book-reader" aria-label={`${book.title} 읽기`}>
    <header className="library-reader-heading">
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
    <div role="status" className="library-reader-status">{error || saveError || (!ready ? '페이지를 준비하고 있습니다…' : `${page} / ${book.pages}쪽 · ${savedPage === page ? '읽던 위치 저장됨' : '읽던 위치 저장 중…'}`)}</div>
    <div className="book-page-scroll" ref={scroll} tabIndex={0} aria-label="PDF 페이지 확대 영역" onKeyDown={event => {
      if (!ready) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setPage(current => bookPage(current + (event.key === 'ArrowRight' ? 1 : -1), book.pages)); }
    }}>
      <canvas ref={canvas} role="img" aria-label={`${page}쪽 PDF 원본 페이지`} data-testid="library-pdf-page" data-page={ready ? page : undefined} style={{ visibility: ready ? 'visible' : 'hidden' }} />
    </div>
    <footer className="book-reader-footer"><button aria-label="이전 페이지" aria-disabled={!ready || page <= 1} onClick={() => { if (ready) setPage(current => bookPage(current - 1, book.pages)); }}><ChevronLeft size={20} />이전</button>
      <span>{page} / {book.pages}</span><button aria-label="다음 페이지" aria-disabled={!ready || page >= book.pages} onClick={() => { if (ready) setPage(current => bookPage(current + 1, book.pages)); }}>다음<ChevronRight size={20} /></button></footer>
  </section>;
}
