import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_PAGES = 30;
const MAX_PDF_PAGE_EDGE = 1600;

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PDF 페이지 이미지를 만들지 못했습니다."));
    }, "image/png");
});

const getPdfBaseName = (fileName: string) => (
    fileName.replace(/\.pdf$/i, "").trim() || "document"
);

export const isPdfFile = (file: File) => (
    file.type === "application/pdf" || /\.pdf$/i.test(file.name)
);

export const renderPdfPagesToImageFiles = async (file: File): Promise<File[]> => {
    const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;

    try {
        if (pdf.numPages > MAX_PDF_PAGES) {
            throw new Error(`PDF는 한 번에 ${MAX_PDF_PAGES}페이지까지 가져올 수 있습니다.`);
        }

        const pageFiles: File[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const renderScale = Math.min(
                2,
                MAX_PDF_PAGE_EDGE / Math.max(baseViewport.width, baseViewport.height),
            );
            const viewport = page.getViewport({ scale: renderScale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(viewport.width));
            canvas.height = Math.max(1, Math.ceil(viewport.height));
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("PDF 렌더링 컨텍스트를 만들지 못했습니다.");

            await page.render({ canvasContext: context, viewport }).promise;
            const blob = await canvasToBlob(canvas);
            pageFiles.push(new File(
                [blob],
                `${getPdfBaseName(file.name)}-${pageNumber}.png`,
                { type: "image/png", lastModified: Date.now() },
            ));
            page.cleanup();
        }
        return pageFiles;
    } finally {
        await pdf.destroy();
    }
};
