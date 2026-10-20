export const getPdfReaderPage = (page: number, count: number, direction: -1 | 1) => (
    Math.max(1, Math.min(count, page + direction))
);

export const getPdfReaderScale = (width: number, height: number) => (
    Math.min(2, 1600 / Math.max(width, height))
);

export const validatePdfReaderFile = (file: { name: string; type: string; size: number }) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return "PDF 파일을 선택해 주세요.";
    if (file.size === 0) return "빈 PDF 파일은 열 수 없습니다.";
    if (file.size > 50 * 1024 * 1024) return "PDF는 50MB 이하의 파일을 선택해 주세요.";
    return null;
};
