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
