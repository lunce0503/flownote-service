import { expect, test, type Page } from '@playwright/test';
import { createCloudActor, stagingApi as api, stagingWeb as web } from './accounts';
import { markdownSource, noteSettings } from './markdown';

export function registerNoteEditing(width: number, engine: 'chromium' | 'webkit') {
  test.describe(`note creation, editing and math ${engine} ${width}`, () => {
    test.use({ viewport: { width, height: 1000 }, ...(engine === 'chromium' ? { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 FlownoteDesktop/1.3.1' } : {}) });
    let ids: string[];
    let actor: Awaited<ReturnType<typeof createCloudActor>>;
    test.beforeEach(async ({ page, request }) => {
      ids = [];
      actor = await createCloudActor(request);
      await page.context().addCookies([{ name: '__Host-flownote_session', value: actor.token, url: web, httpOnly: true, secure: true, sameSite: 'Strict' }]);
      await page.addInitScript(user => {
        localStorage.setItem('flownote_auth_user', JSON.stringify(user));
        Object.assign(window, { unexpectedNotePrompt: false });
        window.prompt = () => { Object.assign(window, { unexpectedNotePrompt: true }); return null; };
      }, actor.user);
    });
    test('a failed folder placement still opens the created note and preserves it as unfiled', async ({ page, request }) => {
      const headers = { Authorization: `Bearer ${actor.token}` };
      const response = await request.post(`${api}/api/note-folders`, { headers, data: { name: 'Synthetic destination', category: 'Synthetic creation' } });
      expect(response.ok()).toBe(true); const folder = await response.json();
      try {
        await page.goto(`${web}/blog`);
        const tree = page.getByRole('treeitem', { name: 'Synthetic destination', exact: true });
        if (!await tree.isVisible()) await page.getByRole('button', { name: '탐색기 토글', exact: true }).click();
        await tree.click();
        await page.route(`**/api/note-folders/${folder.id}/notes/*`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic placement failure"}' }));
        await create(page);
        await expect(page.getByRole('alert').filter({ hasText: '노트는 만들었지만 폴더에 넣지 못했습니다' })).toBeVisible();
        expect((await request.get(`${api}/api/notes/${ids[0]}`, { headers })).ok()).toBe(true);
        const folders = await (await request.get(`${api}/api/note-folders`, { headers })).json();
        expect(folders.every((f: { noteIds?: string[]; note_ids?: string[] }) => !(f.noteIds ?? f.note_ids ?? []).includes(ids[0]))).toBe(true);
      } finally { expect((await request.delete(`${api}/api/note-folders/${folder.id}`, { headers })).ok()).toBe(true); }
    });
    async function create(page: Page) {
      await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
      await expect(page).toHaveURL(/\/blog\/[a-z0-9-]+$/);
      ids.push(page.url().split('/').at(-1)!);
      const editor = page.getByRole('textbox', { name: '노트 편집', exact: true });
      await expect(editor).toBeVisible(); return editor;
    }
    test.afterEach(async ({ request }) => {
      for (const id of ids) expect((await request.delete(`${api}/api/notes/${id}`, { headers: { Authorization: `Bearer ${actor.token}` } })).ok()).toBe(true);
    });
    test('both new-note actions work without prompt and expose only compact, accessible editing tools', async ({ page }) => {
      await page.goto(`${web}/blog`); const editor = await create(page);
      await expect(page.getByLabel('노트 제목')).toHaveValue('제목 없음');
      await page.getByLabel('노트 제목').fill('Synthetic prompt-free note');
      await editor.pressSequentially('first note body');
      await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
      await expect(page.getByRole('toolbar', { name: 'Markdown 서식' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '원문', exact: true })).toHaveCount(0);
      await expect(page.getByText('Markdown을 입력하면 바로 서식이 적용됩니다.', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '편집 도구', exact: true }).click();
      await expect(page.getByRole('toolbar', { name: 'Markdown 서식' })).toBeVisible();
      await expect(page.getByRole('button', { name: '원문', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '미리보기', exact: true }).click();
      await expect(page.getByRole('button', { name: '편집 도구', exact: true })).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Markdown 입력 방식' })).toHaveCount(0);
      await page.getByRole('button', { name: '편집', exact: true }).click();
      await noteSettings(page); await expect(page.getByRole('button', { name: '.md 내보내기', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '.md 내보내기', exact: true })).toBeHidden();
      const buttons = await page.locator('.note-topbar button,.note-document-tools>button,.note-document-tools summary').evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute('aria-label'), text: node.textContent?.trim(), w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
      expect(buttons.length).toBeGreaterThan(4);
      for (const button of buttons) { expect(button.name).toBeTruthy(); expect(button.text).toBe(''); expect(button.w).toBeGreaterThanOrEqual(44); expect(button.h).toBeGreaterThanOrEqual(44); }
      const first = ids[0]; await create(page); expect(ids[1]).not.toBe(first);
      expect(await page.evaluate(() => (window as Window & { unexpectedNotePrompt: boolean }).unexpectedNotePrompt)).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('compact-note-tools.png'), fullPage: true });
    });
    test('editing the middle of one line keeps its caret, neighbours, undo and final Korean composition', async ({ page }) => {
      await page.goto(`${web}/blog`); const editor = await create(page);
      await editor.pressSequentially('alpha beta gamma');
      await editor.press('Home'); for (let n = 0; n < 6; n++) await editor.press('ArrowRight');
      await editor.pressSequentially('new '); await expect(editor).toHaveText('alpha new beta gamma');
      await editor.press('ControlOrMeta+z'); await expect(editor).toHaveText('alpha beta gamma');
      await editor.press('ControlOrMeta+Shift+z'); await expect(editor).toHaveText('alpha new beta gamma');
      await editor.press('Home'); for (let n = 0; n < 6; n++) await editor.press('ArrowRight');
      for (let n = 0; n < 4; n++) await editor.press('Shift+ArrowRight');
      if (engine === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '한글 ' }); await cdp.detach();
      } else await editor.pressSequentially('한글 ');
      await expect(editor).toHaveText('alpha 한글 beta gamma'); await expect(editor.locator('p')).toHaveCount(1);
      await editor.press('End'); await editor.press('Backspace'); await editor.pressSequentially('!');
      await expect(editor).toHaveText('alpha 한글 beta gamm!');
      await editor.press('Home'); await editor.press('Delete'); await expect(editor).toHaveText('lpha 한글 beta gamm!');
      await editor.press('End'); await editor.press('Enter'); await editor.pressSequentially('second line');
      await expect(editor.locator('p')).toHaveCount(2);
      await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
      await page.reload(); await expect(editor).toContainText('lpha 한글 beta gamm!'); await expect(editor).toContainText('second line');
    });
    test('single-dollar and multiline math render, suggest commands and survive source/edit/preview/reload', async ({ page }) => {
      await page.goto(`${web}/blog`); const editor = await create(page);
      await editor.pressSequentially('Inline $ x^2 $ end');
      await expect(editor.locator('[data-type=inline-math]')).toHaveAttribute('data-latex', 'x^2');
      await expect(editor).toContainText('Inline'); await expect(editor).toContainText('end');
      await editor.press('End'); await editor.press('Enter'); await editor.pressSequentially('$$'); await editor.press('Enter');
      await editor.pressSequentially('x = 1'); await editor.press('Enter'); await editor.pressSequentially('y = 2'); await editor.press('Enter'); await editor.pressSequentially('$$');
      await expect(editor.locator('[data-type=block-math]')).toHaveAttribute('data-latex', 'x = 1\ny = 2');
      await editor.pressSequentially('$ \\fr');
      const suggestions = page.getByRole('group', { name: 'LaTeX 명령어 추천', exact: true }); await expect(suggestions).toContainText('\\frac');
      await editor.press('Tab'); await editor.pressSequentially('a'); await editor.press('ArrowRight'); await editor.press('ArrowRight'); await editor.pressSequentially('b'); await editor.press('ArrowRight'); await editor.pressSequentially(' $');
      await expect.poll(() => editor.locator('[data-type=inline-math]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-latex')))).toContain('\\frac{a}{b}');
      await page.getByRole('button', { name: '편집 도구', exact: true }).click(); await page.getByRole('button', { name: '수식 추가', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '수식 편집' }); await dialog.getByLabel('LaTeX 수식', { exact: true }).fill('\\sq');
      await dialog.getByRole('button', { name: /\\sqrt/ }).click(); await expect(dialog.getByLabel('LaTeX 수식', { exact: true })).toHaveValue('\\sqrt{}');
      await dialog.getByLabel('LaTeX 수식', { exact: true }).fill('\\sqrt{4}'); await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
      await expect.poll(() => editor.locator('[data-type=inline-math]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-latex')))).toContain('\\sqrt{4}');
      await expect(page.getByTestId('note-save-status')).toHaveText('서버에 저장됨');
      await page.reload(); await expect(editor.locator('[data-type=block-math]')).toHaveAttribute('data-latex', 'x = 1\ny = 2');
      const source = await markdownSource(page); await expect(source).toHaveValue(/\$\$\nx = 1\ny = 2\n\$\$/);
      await page.getByRole('button', { name: '미리보기', exact: true }).click(); await expect(page.getByTestId('markdown-preview').locator('.katex-display')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('note-math-preview.png'), fullPage: true });
    });
  });
}
