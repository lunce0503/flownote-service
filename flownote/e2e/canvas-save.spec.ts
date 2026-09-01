import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type MockState = {
  saves: Array<{
    canvasId: string;
    payload: {
      addedLines?: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
      modifiedLines?: Array<{ id: string }>;
      deletedLines?: Array<{ id: string }>;
      addedTextBoxes?: Array<{ id: string; text: string }>;
    };
  }>;
};

const resetMock = async (request: APIRequestContext, scenario = "empty") => {
  await request.post(`http://127.0.0.1:4174/__e2e/reset?scenario=${scenario}`);
};

const loginAndOpenCanvas = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("이메일 주소").fill("e2e@flownote.local");
  await page.getByLabel("비밀번호").fill("test-password");
  await page.getByRole("button", { name: "계속하기" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/canvas/e2e-canvas");
  await expect(page.getByTitle("E2E Canvas")).toBeVisible();
  await expect(page.getByText("저장 완료", { exact: true })).toBeVisible();
};

test.describe.configure({ mode: "serial" });

test("login, draw a canvas line, and receive a save acknowledgment", async ({ page, request }) => {
  await resetMock(request);
  await loginAndOpenCanvas(page);

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

test("eraser removes an existing line from the render and save payload", async ({ page, request }) => {
  await resetMock(request, "existing-line");
  await loginAndOpenCanvas(page);

  const canvas = page.getByTestId("canvas-input-surface");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const renderer = page.getByTestId("canvas-render-surface");
  await expect(renderer).toHaveAttribute("data-visible-line-count", "1");
  await page.getByTitle("지우개").click();
  await page.mouse.click(bounds.x + 500, bounds.y + 260);

  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:4174/__e2e/state");
    const mockState = await response.json() as MockState;
    return mockState.saves.at(-1)?.payload.deletedLines?.[0]?.id;
  }).toBe("existing-line");
  await expect(renderer).toHaveAttribute("data-visible-line-count", "0");
});

test("lasso delete removes the selection from the render and save payload", async ({ page, request }) => {
  await resetMock(request, "existing-line");
  await loginAndOpenCanvas(page);

  const canvas = page.getByTestId("canvas-input-surface");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const renderer = page.getByTestId("canvas-render-surface");
  await expect(renderer).toHaveAttribute("data-visible-line-count", "1");
  await page.getByTitle("올가미").click();
  await page.mouse.move(bounds.x + 470, bounds.y + 225);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 630, bounds.y + 225, { steps: 4 });
  await page.mouse.move(bounds.x + 630, bounds.y + 350, { steps: 4 });
  await page.mouse.move(bounds.x + 470, bounds.y + 350, { steps: 4 });
  await page.mouse.move(bounds.x + 470, bounds.y + 225, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByText("선택 1", { exact: true })).toBeVisible();
  await page.getByTitle("선택 영역 삭제").click();

  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:4174/__e2e/state");
    const mockState = await response.json() as MockState;
    return mockState.saves.at(-1)?.payload.deletedLines?.[0]?.id;
  }).toBe("existing-line");
  await expect(renderer).toHaveAttribute("data-visible-line-count", "0");
});

test("text editing uses shift-enter for lines and enter to commit", async ({ page, request }) => {
  await resetMock(request);
  await loginAndOpenCanvas(page);

  const canvas = page.getByTestId("canvas-input-surface");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.getByTitle("텍스트").click();
  await page.mouse.click(bounds.x + 700, bounds.y + 400);
  const editor = page.getByPlaceholder("텍스트 입력");
  await editor.fill("첫 줄");
  await editor.press("Shift+Enter");
  await editor.type("둘째 줄");
  await expect(editor).toHaveValue("첫 줄\n둘째 줄");
  await editor.press("Enter");

  await expect(editor).toHaveCount(0);
  await expect(page.getByTitle("이동")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:4174/__e2e/state");
    const mockState = await response.json() as MockState;
    return mockState.saves.at(-1)?.payload.addedTextBoxes?.[0]?.text;
  }).toBe("첫 줄\n둘째 줄");
});

test("escape cancels a new text box without saving it", async ({ page, request }) => {
  await resetMock(request);
  await loginAndOpenCanvas(page);

  const canvas = page.getByTestId("canvas-input-surface");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.getByTitle("텍스트").click();
  await page.mouse.click(bounds.x + 700, bounds.y + 400);
  const editor = page.getByPlaceholder("텍스트 입력");
  await editor.fill("취소할 텍스트");
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);

  await page.waitForTimeout(1_000);
  const response = await request.get("http://127.0.0.1:4174/__e2e/state");
  const mockState = await response.json() as MockState;
  expect(mockState.saves).toHaveLength(0);
});
