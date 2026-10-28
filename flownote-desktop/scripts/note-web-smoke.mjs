import assert from 'node:assert/strict';

/** Real published Electron/Android WebView input; synthetic cloud staging notes only. */
export async function verifyNoteEditing(page, token) {
  const web = 'https://flownote-react-staging.vercel.app';
  const api = 'https://flownote-api-staging.up.railway.app';
  const ids = [];
  const inlineMath = latex => page.waitForFunction(value => Array.from(document.querySelectorAll('[data-type="inline-math"]')).some(node => node.getAttribute('data-latex') === value), latex);
  const saved = () => page.waitForFunction(() => document.querySelector('[data-testid="note-save-status"]')?.textContent?.trim() === '서버에 저장됨');
  const text = async (editor, expected) => {
    await page.waitForFunction(value => document.querySelector('[role="textbox"][aria-label="노트 편집"]')?.textContent === value, expected);
    assert.equal(await editor.textContent(), expected);
  };
  const create = async () => {
    const previous = page.url();
    await page.getByRole('button', { name: '새 노트', exact: true }).first().click();
    await page.waitForURL(url => /\/blog\/[a-z0-9-]+$/.test(url.pathname) && url.href !== previous);
    ids.push(page.url().split('/').at(-1));
    const editor = page.getByRole('textbox', { name: '노트 편집', exact: true });
    await editor.waitFor(); return editor;
  };
  try {
    await page.goto(web + '/blog');
    const editor = await create();
    assert.equal(await page.getByLabel('노트 제목').inputValue(), '제목 없음');
    await page.getByLabel('노트 제목').fill('Synthetic native note input');
    await editor.pressSequentially('alpha beta gamma');
    await editor.press('Home'); for (let i = 0; i < 6; i++) await editor.press('ArrowRight');
    await editor.pressSequentially('new '); await text(editor, 'alpha new beta gamma');
    await editor.press('ControlOrMeta+z'); await text(editor, 'alpha beta gamma');
    await editor.press('ControlOrMeta+Shift+z'); await text(editor, 'alpha new beta gamma');
    await editor.press('Home'); for (let i = 0; i < 6; i++) await editor.press('ArrowRight');
    for (let i = 0; i < 4; i++) await editor.press('Shift+ArrowRight');
    const cdp = await page.context().newCDPSession(page);
    await editor.evaluate(node => { node.setAttribute('data-ime-ends', '0'); node.addEventListener('compositionend', () => node.setAttribute('data-ime-ends', String(Number(node.getAttribute('data-ime-ends')) + 1))); });
    await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: '한글 ' }); await cdp.detach();
    await text(editor, 'alpha 한글 beta gamma');
    assert.equal(await editor.getAttribute('data-ime-ends'), '1', 'Multi-step IME must finish once, with no duplicate commit');
    assert.equal(await editor.locator('p').count(), 1);
    await editor.press('End'); await editor.press('Backspace'); await editor.pressSequentially('!');
    await text(editor, 'alpha 한글 beta gamm!');
    await editor.press('Home'); await editor.press('Delete'); await text(editor, 'lpha 한글 beta gamm!');
    await editor.press('End'); await editor.press('Enter'); await editor.pressSequentially('second line');
    assert.equal(await editor.locator('p').count(), 2); await saved();
    await page.reload(); await editor.waitFor();
    assert((await editor.textContent()).includes('lpha 한글 beta gamm!')); assert((await editor.textContent()).includes('second line'));
    assert.equal(await page.getByRole('toolbar', { name: 'Markdown 서식' }).count(), 0);
    await editor.press('ControlOrMeta+End'); await editor.press('Enter'); await editor.pressSequentially('Inline $ x^2 $ end');
    await editor.locator('[data-type="inline-math"][data-latex="x^2"]').waitFor();
    await editor.press('End'); await editor.press('Enter'); await editor.pressSequentially('$$'); await editor.press('Enter');
    await editor.pressSequentially('x = 1'); await editor.press('Enter'); await editor.pressSequentially('y = 2'); await editor.press('Enter'); await editor.pressSequentially('$$');
    await editor.locator('[data-type="block-math"]').waitFor();
    assert.equal(await editor.locator('[data-type="block-math"]').getAttribute('data-latex'), 'x = 1\ny = 2');
    await editor.pressSequentially('$ \\fr'); await page.getByRole('group', { name: 'LaTeX 명령어 추천', exact: true }).waitFor();
    await editor.press('Tab'); await editor.pressSequentially('a'); await editor.press('ArrowRight'); await editor.press('ArrowRight');
    await editor.pressSequentially('b'); await editor.press('ArrowRight'); await editor.pressSequentially(' $');
    await inlineMath('\\frac{a}{b}');
    await page.getByRole('button', { name: '편집 도구', exact: true }).click();
    await page.getByRole('button', { name: '수식 추가', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '수식 편집', exact: true });
    await dialog.getByLabel('LaTeX 수식', { exact: true }).fill('\\sq');
    await dialog.getByRole('button', { name: /\\sqrt/ }).click();
    assert.equal(await dialog.getByLabel('LaTeX 수식', { exact: true }).inputValue(), '\\sqrt{}');
    await dialog.getByLabel('LaTeX 수식', { exact: true }).fill('\\sqrt{4}');
    await dialog.getByRole('button', { name: '수식 적용', exact: true }).click();
    await inlineMath('\\sqrt{4}'); await saved();
    await page.reload(); await editor.locator('[data-type="block-math"]').waitFor();
    assert.equal(await editor.locator('[data-type="block-math"]').getAttribute('data-latex'), 'x = 1\ny = 2');
    await page.getByRole('button', { name: '편집 도구', exact: true }).click();
    await page.getByRole('button', { name: '원문', exact: true }).click();
    const source = page.getByLabel('Markdown 본문', { exact: true });
    assert.match(await source.inputValue(), /\$\$\nx = 1\ny = 2\n\$\$/);
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await page.getByTestId('markdown-preview').locator('.katex-display').waitFor();
    await page.getByRole('button', { name: '편집', exact: true }).click();
    await create(); assert.notEqual(ids[0], ids[1]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log('PASS native notes: both prompt-free creation actions, middle editing/selection replacement, Home/End/Delete/Backspace/Enter, undo/redo, CDP Korean composition, compact tools, $/multiline $$, suggestions/Tab caret, accessible math dialog, save/source/preview/reload');
  } finally {
    for (const id of ids) {
      const response = await fetch(`${api}/api/notes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      assert(response.ok, `Synthetic native note cleanup: ${response.status}`);
    }
  }
}
