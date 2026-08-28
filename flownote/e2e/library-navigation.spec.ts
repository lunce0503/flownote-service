import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("이메일 주소").fill("e2e@flownote.local");
  await page.getByLabel("비밀번호").fill("test-password");
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page).toHaveURL("/");
};

test("canvas library shows recent items first and folders below", async ({ page }) => {
  await login(page);
  await page.goto("/canvas");

  const recentSection = page.getByTestId("canvas-recent-section");
  const recentTitles = recentSection.getByRole("heading", { level: 3 });
  await expect(recentTitles).toHaveCount(2);
  await expect(recentTitles.nth(0)).toHaveText("최근 캔버스");
  await expect(page.getByRole("heading", { name: "업무", exact: true })).toBeVisible();
  await expect(page.getByText("프로젝트", { exact: true })).toBeVisible();
});

test("canvas detail uses a parent navigation button without a folder popup", async ({ page }) => {
  await login(page);
  await page.goto("/canvas/e2e-canvas");

  await expect(page.getByTitle("E2E Canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "그림판 목록으로" })).toBeVisible();
  await expect(page.getByText("Canvas Library", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "그림판 목록으로" }).click();
  await expect(page).toHaveURL("/canvas");
});

test("blog cards link by note id and use the same recent-folder order", async ({ page }) => {
  await page.goto("/blog");

  const recentSection = page.getByTestId("blog-recent-section");
  const recentLinks = recentSection.getByRole("link");
  await expect(recentLinks.first()).toHaveAttribute("href", "/blog/recent-note");
  await expect(page.getByRole("heading", { name: "업무", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "이전 노트" }).first()).toHaveAttribute("href", "/blog/older-note");

  await recentLinks.first().click();
  await expect(page).toHaveURL("/blog/recent-note");
  await expect(page.locator('input[value="최근 노트"]')).toBeVisible();
});

test("canvas and blog libraries do not overflow a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const path of ["/canvas", "/blog"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
