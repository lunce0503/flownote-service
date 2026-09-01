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

test("multiple weekday and time periods are saved from one schedule form", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/planner");
  await page.getByRole("button", { name: "주간", exact: true }).click();
  await page.getByRole("button", { name: "일정 추가" }).click();

  await page.getByPlaceholder("일정 이름").fill("집중 작업");

  const firstPeriod = page.getByRole("group", { name: "기간 1" });
  await expect(firstPeriod.getByLabel("시작")).toHaveAttribute("step", "300");
  await expect(firstPeriod.getByLabel("종료")).toHaveAttribute("step", "300");
  for (const day of ["화", "수", "목", "금"]) {
    await firstPeriod.getByRole("button", { name: day, exact: true }).click();
  }
  await firstPeriod.getByLabel("시작").fill("09:30");
  await firstPeriod.getByLabel("종료").fill("11:00");

  await page.getByRole("button", { name: "기간 추가" }).click();
  const secondPeriod = page.getByRole("group", { name: "기간 2" });
  await secondPeriod.getByRole("button", { name: "수", exact: true }).click();
  await secondPeriod.getByLabel("시작").fill("14:00");
  await secondPeriod.getByLabel("종료").fill("16:30");

  await page.getByRole("button", { name: "기간 2개 저장" }).click();
  await expect(page.getByRole("list", { name: "주간 일정 목록" }).getByRole("listitem")).toHaveCount(2);

  const stateResponse = await request.get("http://127.0.0.1:4174/__e2e/state");
  const state = await stateResponse.json();
  expect(state.scheduleItems).toMatchObject([
    { days_of_week: ["MON"], start_time: "09:30", end_time: "11:00" },
    { days_of_week: ["WED"], start_time: "14:00", end_time: "16:30" },
  ]);

  const form = page.getByText("새 일정", { exact: true });
  await expect(form).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("daily timetable uses 24 hours, five-minute cells, and paint undo", async ({ page }) => {
  const diaryWrites: Array<{
    todos: unknown[];
    grid: { startHour: number; endHour: number; cols: number; cells: Record<string, string> };
    journal: unknown[];
  }> = [];
  await page.route("**/api/diary/*", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    const payload = route.request().postDataJSON() as (typeof diaryWrites)[number];
    diaryWrites.push(payload);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("**/api/diary?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      entry_date: "2026-09-01",
      todos: [{ id: "legacy-todo", label: "기존 일정", color: "#ef4444", done: false }],
      grid: { startHour: 6, endHour: 24, cols: 6, cells: { "0": "legacy-todo" }, strokes: [] },
      journal: [],
    }),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/planner");

  await expect(page).toHaveTitle(/^플래너-\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("button", { name: "펜", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "되돌리기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "필기 지움", exact: true })).toHaveCount(0);

  const undoButton = page.getByRole("button", { name: "칠하기 되돌리기" });
  await expect(undoButton).toBeDisabled();

  const timetable = page.locator("canvas").first();
  await expect(timetable).toBeVisible();
  expect(await timetable.evaluate((canvas) => canvas.style.height)).toBe("624px");
  await timetable.click({ position: { x: 60, y: 13 } });
  await expect(undoButton).toBeEnabled();

  await expect.poll(() => diaryWrites.length).toBeGreaterThan(0);
  expect(diaryWrites.at(-1)?.grid).toMatchObject({
    startHour: 0,
    endHour: 24,
    cols: 12,
    cells: { "0": "legacy-todo", "72": "legacy-todo", "73": "legacy-todo" },
  });

  const writesBeforeUndo = diaryWrites.length;
  await undoButton.click();
  await expect(undoButton).toBeDisabled();
  await expect.poll(() => diaryWrites.length).toBeGreaterThan(writesBeforeUndo);
  expect(diaryWrites.at(-1)?.grid.cells).toEqual({ "72": "legacy-todo", "73": "legacy-todo" });
});
