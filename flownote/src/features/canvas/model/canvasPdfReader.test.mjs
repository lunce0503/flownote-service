import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPdfReaderPage, getPdfReaderScale, validatePdfReaderFile } from './canvasPdfReader.ts';

test('turns pages one at a time without passing either end of the book', () => {
  assert.equal(getPdfReaderPage(1, 3, -1), 1);
  assert.equal(getPdfReaderPage(1, 3, 1), 2);
  assert.equal(getPdfReaderPage(2, 3, 1), 3);
  assert.equal(getPdfReaderPage(3, 3, 1), 3);
  assert.equal(getPdfReaderPage(3, 3, -1), 2);
  assert.equal(getPdfReaderPage(1, 1, 1), 1);
});

test('fits portrait and landscape pages while bounding raster memory', () => {
  assert.equal(getPdfReaderScale(612, 792), 2);
  assert.equal(getPdfReaderScale(612, 900), 1600 / 900);
  assert.equal(getPdfReaderScale(2400, 1200), 1600 / 2400);
  assert.equal(getPdfReaderScale(100, 100), 2);
});

test('accepts PDF files but rejects other formats and oversized or empty files before reading', () => {
  assert.equal(validatePdfReaderFile({ name: 'book.pdf', type: '', size: 1024 }), null);
  assert.equal(validatePdfReaderFile({ name: 'book', type: 'application/pdf', size: 1024 }), null);
  assert.match(validatePdfReaderFile({ name: 'image.png', type: 'image/png', size: 1024 }), /PDF/);
  assert.match(validatePdfReaderFile({ name: 'book.pdf', type: 'application/pdf', size: 0 }), /빈/);
  assert.match(validatePdfReaderFile({ name: 'book.pdf', type: 'application/pdf', size: 50 * 1024 * 1024 + 1 }), /50MB/);
});
