import { expect, test } from "@playwright/test";

type MockState = {
  saves: Array<{
    canvasId: string;
    payload: {
      addedLines?: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
    };
  }>;
};

test("login, draw a canvas line, and receive a save acknowledgment", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("이메일 주소").fill("e2e@flownote.local");
  await page.getByLabel("비밀번호").fill("test-password");
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/canvas/e2e-canvas");
  await expect(page.getByTitle("E2E Canvas")).toBeVisible();
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();

  const canvas = page.getByTestId("canvas-input-surface");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.mouse.move(bounds.x + 520, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 600, bounds.y + 320, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:4174/__e2e/state");
    const mockState = await response.json() as MockState;
    return mockState.saves.at(-1)?.payload.addedLines?.[0]?.points.length ?? 0;
  }).toBeGreaterThan(1);
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
});
