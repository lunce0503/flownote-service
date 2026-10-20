import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
// The canvas feature also configures the existing bundled PDF.js worker.
import { getPdfReaderPage, getPdfReaderScale, validatePdfReaderFile } from "@/features/canvas";

const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-blue-600 aria-disabled:opacity-40";

export const CanvasPdfReader = ({ onClose }: { onClose: () => void }) => {
    const [file, setFile] = useState<File | null>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [renderedPage, setRenderedPage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        if (!file) return;
        let active = true;
        let task: ReturnType<typeof getDocument> | undefined;
        void (async () => {
            try {
                const data = new Uint8Array(await file.arrayBuffer());
                if (!active) return;
                task = getDocument({ data, isEvalSupported: false });
                const document = await task.promise;
                if (active) setPdf(document);
            } catch {
                if (active) setError("PDF를 열지 못했습니다. 암호가 없는 올바른 PDF를 선택해 주세요.");
            }
        })();
        return () => {
            active = false;
            void task?.destroy().catch(() => {});
        };
    }, [file]);

    useEffect(() => {
        if (!pdf) return;
        let active = true;
        let renderTask: RenderTask | undefined;
        void (async () => {
            const buffer = document.createElement("canvas");
            let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | undefined;
            try {
                page = await pdf.getPage(pageNumber);
                if (!active) return;
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: getPdfReaderScale(base.width, base.height) });
                buffer.width = Math.max(1, Math.ceil(viewport.width));
                buffer.height = Math.max(1, Math.ceil(viewport.height));
                const context = buffer.getContext("2d", { alpha: false });
                if (!context) throw new Error("PDF render unavailable");
                renderTask = page.render({ canvasContext: context, viewport });
                await renderTask.promise;
                const canvas = canvasRef.current;
                if (!active || !canvas) return;
                canvas.width = buffer.width;
                canvas.height = buffer.height;
                const display = canvas.getContext("2d", { alpha: false });
                if (!display) throw new Error("PDF display unavailable");
                display.drawImage(buffer, 0, 0);
                setRenderedPage(pageNumber);
            } catch {
                if (active) setError("PDF 페이지를 표시하지 못했습니다. 파일을 다시 선택해 주세요.");
            } finally {
                page?.cleanup();
                buffer.width = 0;
                buffer.height = 0;
            }
        })();
        return () => { active = false; renderTask?.cancel(); };
    }, [pdf, pageNumber]);

    const ready = Boolean(pdf && renderedPage === pageNumber && !error);
    const turnPage = (direction: -1 | 1) => {
        if (ready && pdf) setPageNumber((current) => getPdfReaderPage(current, pdf.numPages, direction));
    };

    return (
        <aside
            aria-label="PDF 책 읽기"
            data-canvas-touch-allow="true"
            className="canvas-pdf-reader order-first flex h-1/2 min-h-0 w-full shrink-0 flex-col border-b border-stone-200 bg-white lg:order-last lg:h-full lg:w-[40%] lg:border-b-0 lg:border-l"
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") onClose();
                if (event.target instanceof HTMLInputElement) return;
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    turnPage(event.key === "ArrowLeft" ? -1 : 1);
                }
            }}
            onPaste={(event) => event.stopPropagation()}
        >
            <div className="flex shrink-0 items-center justify-between gap-2 px-3">
                <h2 className="min-w-0 truncate font-bold" title={file?.name}>{file?.name || "PDF 책 읽기"}</h2>
                <button type="button" className={buttonClass} aria-label="PDF 책 읽기 닫기" onClick={onClose}><X size={18} /></button>
            </div>
            <div className="shrink-0 px-3 pb-2">
                <label className="block text-sm font-semibold">
                    읽을 PDF 선택
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="mt-1 block w-full min-w-0 text-sm"
                        onChange={(event) => {
                            const selected = event.target.files?.[0];
                            event.target.value = "";
                            if (!selected) return;
                            setPdf(null);
                            setRenderedPage(0);
                            setPageNumber(1);
                            const validationError = validatePdfReaderFile(selected);
                            setError(validationError);
                            setFile(validationError ? null : selected);
                        }}
                    />
                </label>
                <p className="mt-1 text-xs text-stone-500">기기에만 열리며 업로드·저장되지 않습니다.</p>
            </div>
            {error && <p role="alert" className="px-3 text-sm text-red-700">{error}</p>}
            <p role="status" aria-live="polite" className="shrink-0 px-3 text-sm text-stone-600">
                {!file && !error ? "PDF를 선택하고 캔버스에 함께 필기하세요." : error ? "다른 PDF를 선택해 다시 시도할 수 있습니다." : !pdf ? "PDF를 여는 중…" : !ready ? "페이지를 표시하는 중…" : `${pageNumber} / ${pdf.numPages} 페이지`}
            </p>
            <div data-testid="canvas-pdf-scroll" className="min-h-0 flex-1 overflow-auto overscroll-contain p-2" style={{ touchAction: "pan-y" }} aria-busy={Boolean(file && !ready && !error)}>
                <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label={`PDF ${pageNumber}페이지`}
                    data-testid="canvas-pdf-page"
                    data-page-number={ready ? renderedPage : undefined}
                    className={`mx-auto h-auto max-w-full shadow-sm ${ready ? "block" : "hidden"}`}
                    style={{ touchAction: "pan-y" }}
                />
            </div>
            <nav aria-label="PDF 페이지 이동" className="flex shrink-0 items-center justify-center gap-3 border-t border-stone-200">
                <button type="button" className={buttonClass} aria-label="PDF 이전 페이지" aria-disabled={!ready || pageNumber <= 1} onClick={() => turnPage(-1)}><ChevronLeft size={20} /></button>
                <span className="text-sm tabular-nums">{pdf ? `${pageNumber} / ${pdf.numPages}` : "—"}</span>
                <button type="button" className={buttonClass} aria-label="PDF 다음 페이지" aria-disabled={!ready || pageNumber >= (pdf?.numPages ?? 0)} onClick={() => turnPage(1)}><ChevronRight size={20} /></button>
            </nav>
        </aside>
    );
};
