import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("이메일 주소").fill("e2e@flownote.local");
  await page.getByLabel("비밀번호").fill("test-password");
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page).toHaveURL("/");
};

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:4174/__e2e/reset");
});

test("browser title follows feature and current document context", async ({ page }) => {
  await page.goto("/blog/recent-note");
  await expect(page).toHaveTitle("게시글-최근 노트");

  const noteTitle = page.getByLabel("노트 제목");
  await noteTitle.fill("브라우저 제목");
  await expect(page).toHaveTitle("게시글-브라우저 제목");

  await login(page);
  await page.goto("/canvas/e2e-canvas");
  await expect(page).toHaveTitle("그림판-E2E Canvas");

  await page.goto("/planner");
  const selectedDate = await page.locator('input[type="date"]').inputValue();
  await expect(page).toHaveTitle(`플래너-${selectedDate}`);
});
