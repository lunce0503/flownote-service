import { expect, type Page } from '@playwright/test';
export async function showReaderTools(page: Page) {
 const toggle=page.getByRole('button',{name:'읽기 도구 표시',exact:true});
 if(await toggle.isVisible())await toggle.click();
 await expect(page.getByRole('button',{name:'다음 페이지',exact:true})).toBeVisible();
}
export async function openReaderSettings(page:Page){
 await page.getByRole('button',{name:'읽기 메뉴',exact:true}).click();
 await page.getByRole('menuitem',{name:'읽기 설정',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'읽기 설정',exact:true})).toBeVisible();
}
export async function setReaderRegion(page:Page,region:string){
 await openReaderSettings(page);await page.getByLabel('페이지 보기',{exact:true}).selectOption(region);
 await page.getByRole('button',{name:'읽기 계속',exact:true}).click();await showReaderTools(page);
}
