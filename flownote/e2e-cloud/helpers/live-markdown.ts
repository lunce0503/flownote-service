import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createCloudActor as actor, stagingApi as api, stagingWeb as web } from './accounts';
export function registerLiveMarkdown(width: number, engine: 'chromium' | 'webkit') {
  test.describe(`live Markdown at ${width}px (${engine})`, () => {
  test.use({ viewport: { width, height: 1000 } });
  test('editing renders immediately, preserves math/GFM, blocks unsafe URLs, autosaves Korean and does not write on open', async ({ page, request }) => {
    const account = await actor(request), id = randomUUID(), headers = { Authorization: `Bearer ${account.token}` };
    const markdown = '# Existing title\n\n**Bold** and $x^2$.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Existing task\n\n<script>window.liveInjected=true</script>\n\n[unsafe](javascript:alert(1))\n';
    expect((await request.post(`${api}/api/notes`, { headers, data: { id, title: 'Live Markdown verification', content: { format: 'markdown', version: 1, markdown }, revision: 1, client_id: randomUUID() } })).ok()).toBeTruthy();
    await page.context().addCookies([{ name: '__Host-flownote_session', value: account.token, url: web, secure: true, httpOnly: true, sameSite: 'Strict' }]);
    await page.addInitScript(user => localStorage.setItem('flownote_auth_user', JSON.stringify(user)), account.user);
    try {
      const writes: string[] = [];
      page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/notes')) writes.push(r.url()); });
      await page.goto(`${web}/blog/${id}`);
      const live = page.getByTestId('markdown-live-editor');
      await expect(live.getByRole('heading', { name: 'Existing title' })).toBeVisible();
      await expect(live.locator('strong').filter({ hasText: 'Bold' })).toBeVisible();
      await expect(live.locator('table')).toBeVisible(); await expect(live.locator('.katex')).toBeVisible();
      await expect(live.locator('input[type=checkbox]')).toBeChecked();
      expect(await live.locator('a').evaluateAll(nodes => nodes.every(node => !node.getAttribute('href')?.startsWith('javascript:')))).toBe(true);
      expect(await page.evaluate(() => (window as Window & { liveInjected?: boolean }).liveInjected)).toBeUndefined();
      // Render and focus alone must leave exact source and revision unchanged.
      await page.getByRole('textbox', { name: '노트 편집', exact: true }).focus();
      const untouched = await (await request.get(`${api}/api/notes/${id}`, { headers })).json();
      expect(untouched.revision).toBe(1); expect(untouched.content.markdown).toBe(markdown); expect(writes).toHaveLength(0);
      const editor = page.getByRole('textbox', { name: '노트 편집', exact: true });
      await editor.press('ControlOrMeta+End'); await editor.press('Enter');
      await editor.pressSequentially('## Instant heading'); await editor.press('Enter');
      await editor.pressSequentially('**Rendered immediately**');
      await expect(live.locator('h2').filter({ hasText: 'Instant heading' })).toBeVisible();
      await expect(live.locator('strong').filter({ hasText: 'Rendered immediately' })).toBeVisible();
      await editor.press('Enter');
      if (engine === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '한글 최종 입력' });
        await cdp.detach();
      } else await editor.pressSequentially('한글 최종 입력');
      await expect.poll(async () => (await (await request.get(`${api}/api/notes/${id}`, { headers })).json()).content.markdown).toContain('한글 최종 입력');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.reload(); await expect(page.getByRole('textbox', { name: '노트 편집', exact: true })).toContainText('한글 최종 입력');
      await expect(page.getByTestId('markdown-live-editor').locator('.katex')).toBeVisible();
    } finally { expect((await request.delete(`${api}/api/notes/${id}`, { headers })).ok()).toBeTruthy(); }
  });
});

}
