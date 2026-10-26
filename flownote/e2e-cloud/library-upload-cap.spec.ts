import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { textbookPdf } from '../../flownote-desktop/scripts/library-fixture.mjs';
import { createCloudActor, stagingApi as api } from './helpers/accounts';

// Completed sessions remain idempotency receipts, never unfinished-upload quota.
test('completed books release upload capacity while four unfinished uploads remain bounded', async ({ request }) => {
  test.setTimeout(180000);
  const actor = await createCloudActor(request), headers = { Authorization: `Bearer ${actor.token}` };
  const original = textbookPdf(4096), completed: { book: string; session: string }[] = [];
  const metadata = () => ({ id: randomUUID(), title: 'Synthetic sequential cloud upload', subject: '수학', pages: 1, page: 1,
    bookmarks: [], favorite: false, cover: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    filename: 'synthetic-upload-cap.pdf', bytes: original.length, createdAt: new Date().toISOString() });
  const start = (book: ReturnType<typeof metadata>) => request.post(`${api}/api/library/uploads`, { headers, data: { book } });
  try {
    for (let index = 0; index < 6; index++) {
      const book = metadata(), response = await start(book);
      expect(response.ok(), `completed books must not block book ${index + 1}`).toBeTruthy();
      const session = await response.json();
      expect((await request.put(`${api}/api/library/uploads/${session.id}/chunks/0`, {
        headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Chunk-Sha256': createHash('sha256').update(original).digest('hex') }, data: original,
      })).ok()).toBeTruthy();
      expect((await request.post(`${api}/api/library/uploads/${session.id}/complete`, { headers })).ok()).toBeTruthy();
      completed.push({ book: book.id, session: session.id });
    }
    const unfinished = metadata(), first = await start(unfinished);
    expect(first.ok()).toBeTruthy(); const firstSession = await first.json();
    for (let index = 1; index < 4; index++) expect((await start(metadata())).ok()).toBeTruthy();
    expect((await start(metadata())).status()).toBe(429);
    const resumed = await start(unfinished); expect(resumed.ok()).toBeTruthy(); expect((await resumed.json()).id).toBe(firstSession.id);
    const receipt = await request.post(`${api}/api/library/uploads/${completed[0].session}/complete`, { headers });
    expect(receipt.ok()).toBeTruthy(); expect((await receipt.json()).id).toBe(completed[0].book);
  } finally {
    for (const item of completed) {
      const response = await request.get(`${api}/api/library/books/${item.book}`, { headers });
      expect(response.ok()).toBeTruthy(); const book = await response.json();
      expect((await request.delete(`${api}/api/library/books/${book.id}?revision=${book.revision}`, { headers })).ok()).toBeTruthy();
    }
  }
});
