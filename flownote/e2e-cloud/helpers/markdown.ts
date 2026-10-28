import { expect, type Page } from '@playwright/test';
// Raw Markdown assertions still verify exact data; live rendering has separate user-input coverage.
export async function markdownSource(page: Page) {
  const source = page.getByRole('button', { name: '원문', exact: true });
  if (!await source.isVisible()) {
    const tools = page.getByRole('button', { name: '편집 도구', exact: true });
    if (!await tools.isVisible()) await page.getByRole('button', { name: '편집', exact: true }).click();
    if (await tools.getAttribute('aria-expanded') !== 'true') await tools.click();
  }
  await expect(source).toBeVisible();
  if (await source.getAttribute('aria-pressed') !== 'true') await source.click();
  return page.getByLabel('Markdown 본문');
}

export async function noteSettings(page: Page) {
  const menu = page.locator('.note-settings-menu');
  if (!await menu.evaluate(node => (node as HTMLDetailsElement).open)) await page.getByLabel('노트 세부 설정', { exact: true }).click();
}
