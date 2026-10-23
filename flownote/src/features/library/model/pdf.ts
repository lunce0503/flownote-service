import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { validateBookFile } from './library';
GlobalWorkerOptions.workerSrc = workerUrl;
export const openBookPdf = async (blob: Blob) => {
  const data = new Uint8Array(await blob.arrayBuffer());
  if (!new TextDecoder('ascii').decode(data.subarray(0, 1024)).includes('%PDF-')) throw new Error('올바른 PDF 파일이 아닙니다.');
  const task = getDocument({ data, isEvalSupported: false, disableAutoFetch: true });
  // Password-protected books require a dedicated password flow in a later version.
  task.onPassword = () => { void task.destroy().catch(() => {}); };
  try { return await task.promise; }
  catch (error) { await task.destroy().catch(() => {}); throw new Error('PDF를 열지 못했습니다. 암호가 없는 PDF인지 확인해 주세요.', { cause: error }); }
};
export const inspectBook = async (file: File) => {
  validateBookFile(file);
  const pdf = await openBookPdf(file);
  let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
  const canvas = document.createElement('canvas');
  try {
    page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, 600 / Math.max(base.width, base.height)) });
    canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('표지를 만들지 못했습니다.');
    await page.render({ canvasContext: context, viewport }).promise;
    return { pages: pdf.numPages, cover: canvas.toDataURL('image/jpeg', .8) };
  } finally { page?.cleanup(); canvas.width = canvas.height = 0; await pdf.destroy(); }
};
