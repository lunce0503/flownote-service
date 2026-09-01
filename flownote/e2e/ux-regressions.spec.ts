import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("이메일 주소").fill("e2e@flownote.local");
  await page.getByLabel("비밀번호").fill("test-password");
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page).toHaveURL("/");
};

test("signup reports a server failure and stays on the form", async ({ page }) => {
  await page.route("**/api/users", (route) => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: "가입 처리 실패" }),
  }));
  await page.goto("/signup");

  await page.getByLabel("사용자 이름").fill("failed-user");
  await page.getByLabel("닉네임").fill("실패 사용자");
  await page.getByLabel("이메일 주소").fill("failed@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password");
  await page.getByLabel("비밀번호 확인").fill("test-password");
  await page.getByRole("button", { name: "계정 만들기" }).click();

  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("alert")).toContainText("가입 처리 실패");
});

test("home search filters real destinations and login hides unavailable actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "기능 검색" }).fill("플래너");
  await expect(page.getByRole("link", { name: /플래너/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /캔버스 열기/ })).toHaveCount(0);

  await page.goto("/login");
  await expect(page.getByText("비밀번호를 잊으셨나요?", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Google|Github/ })).toHaveCount(0);
});

test("blog load failures are distinct from an empty library", async ({ page }) => {
  await page.route("**/api/notes", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "notes unavailable" }),
  }));
  await page.goto("/blog");

  await expect(page.getByRole("alert")).toContainText("데이터를 불러오는 중 오류가 발생했습니다.");
  await expect(page.getByText("작성된 글이 없습니다", { exact: true })).toHaveCount(0);
});

test("note autosave stops after bounded retries and exposes recovery actions", async ({ page }) => {
  let saveAttempts = 0;
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    saveAttempts += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "save unavailable" }),
    });
  });
  await page.goto("/blog/recent-note");

  await page.locator('input[value="최근 노트"]').fill("저장 실패 테스트");
  await expect(page.getByRole("status")).toContainText("저장 실패", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "저장 다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "변경 취소" })).toBeVisible();

  const attemptsAfterFailure = saveAttempts;
  await page.waitForTimeout(2_500);
  expect(saveAttempts).toBe(attemptsAfterFailure);
  expect(saveAttempts).toBeLessThanOrEqual(4);
});

test("mobile note header and canvas actions remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/blog/recent-note");

  const titleWidth = await page.locator('input[value="최근 노트"]').evaluate((element) => (
    element.getBoundingClientRect().width
  ));
  expect(titleWidth).toBeGreaterThanOrEqual(250);

  await page.goto("/canvas/e2e-canvas");
  await expect(page.getByRole("button", { name: "파일 동작" })).toBeVisible();
  await page.getByRole("button", { name: "파일 동작" }).click();
  await expect(page.getByRole("menuitem", { name: "캔버스 저장" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "그림판 설정" })).toBeVisible();
});

test("menus and drawing dialog close with Escape and restore focus", async ({ page }) => {
  await page.goto("/");
  const moreButton = page.getByRole("button", { name: "기타" });
  await moreButton.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(moreButton).toBeFocused();

  await page.goto("/blog/recent-note");
  await page.getByRole("button", { name: "드로잉 필기" }).click();
  await expect(page.getByRole("dialog", { name: "드로잉 필기" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "드로잉 필기" })).toHaveCount(0);
});
