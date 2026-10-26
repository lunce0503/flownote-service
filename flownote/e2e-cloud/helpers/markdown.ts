import { expect, type Page } from '@playwright/test';
// Raw Markdown assertions still verify exact data; live rendering has separate user-input coverage.
export async function markdownSource(page: Page) {
  const source = page.getByRole('button', { name: '원문', exact: true });
  await expect(source).toBeVisible();
  if (await source.getAttribute('aria-pressed') !== 'true') await source.click();
  return page.getByLabel('Markdown 본문');
}
