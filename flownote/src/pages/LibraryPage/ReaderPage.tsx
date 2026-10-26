import { useEffect, useRef, useState } from 'react';
import { renderTextLayer, type PDFDocumentProxy, type TextLayerRenderTask } from 'pdfjs-dist';
import { readingCrop, type ReadingRegion } from '@/features/library';

export default function ReaderPage({ pdf, page, width, zoom, region, renderKey, onReady, onError }: {
  pdf: PDFDocumentProxy; page: number; width: number; zoom: number; region: ReadingRegion; renderKey: string;
  onReady: (page: number, key: string) => void; onError: (key: string, message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState('');
  const [hasText, setHasText] = useState(true);
  useEffect(() => {
    if (!width) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let textTask: TextLayerRenderTask | undefined;
    const buffer = document.createElement('canvas');
    void (async () => {
      let pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
      try {
        pdfPage = await pdf.getPage(page);
        if (!active) return;
        const base = pdfPage.getViewport({ scale: 1 }), crop = readingCrop(base.width, base.height, region);
        const cssScale = width * zoom / crop.width;
        const scale = Math.min(cssScale * Math.min(window.devicePixelRatio || 1, 2), 4096 / Math.max(crop.width, crop.height));
        buffer.width = Math.max(1, Math.ceil(crop.width * scale)); buffer.height = Math.max(1, Math.ceil(crop.height * scale));
        const context = buffer.getContext('2d', { alpha: false });
        if (!context) throw new Error('페이지를 그릴 수 없습니다.');
        task = pdfPage.render({ canvasContext: context, viewport: pdfPage.getViewport({ scale }), transform: [1, 0, 0, 1, -crop.x * scale, -crop.y * scale] });
        await task.promise;
        const text = await pdfPage.getTextContent(), textBuffer = document.createElement('div');
        const viewport = pdfPage.getViewport({ scale: cssScale });
        textTask = renderTextLayer({ textContentSource: text, container: textBuffer, viewport, textDivs: [] });
        await textTask.promise;
        if (!active || !canvas.current || !layer.current) return;
        const target = canvas.current;
        target.width = buffer.width; target.height = buffer.height;
        target.style.width = `${Math.round(crop.width * cssScale)}px`; target.style.height = `${Math.round(crop.height * cssScale)}px`;
        target.getContext('2d')?.drawImage(buffer, 0, 0);
        layer.current.replaceChildren(...textBuffer.childNodes);
        Object.assign(layer.current.style, { width: `${viewport.width}px`, height: `${viewport.height}px`, left: `${-crop.x * cssScale}px`, top: `${-crop.y * cssScale}px` });
        layer.current.style.setProperty('--scale-factor', String(cssScale));
        setHasText(text.items.some(item => 'str' in item && !!item.str.trim()));
        setRendered(renderKey); onReady(page, renderKey);
      } catch (error) { if (active) onError(renderKey, error instanceof Error ? error.message : '페이지를 표시하지 못했습니다.'); }
      finally { pdfPage?.cleanup(); buffer.width = buffer.height = 0; }
    })();
    return () => { active = false; task?.cancel(); textTask?.cancel(); };
  }, [pdf, page, width, zoom, region, renderKey, onReady, onError]);
  return <div className="reader-pdf-sheet" data-reader-page={page} style={{ width: Math.round(width * zoom) }}>
    <div className="library-page-frame" style={{ visibility: rendered === renderKey ? 'visible' : 'hidden' }}>
      <canvas ref={canvas} role="img" aria-label={`${page}쪽 PDF 원본 페이지`} data-testid="library-pdf-page" data-page={rendered === renderKey ? page : undefined} />
      <div ref={layer} className="library-text-layer" data-testid="library-pdf-text" data-page={page} aria-label={`${page}쪽 선택 가능한 PDF 텍스트`} />
    </div>
    {!hasText && <p className="reader-no-text">선택 가능한 텍스트가 없는 페이지입니다. 읽기 메뉴의 사전에서 직접 단어를 검색할 수 있습니다.</p>}
    <span className="reader-sheet-number" aria-hidden="true">{page}</span>
  </div>;
}
