import { expect, test } from "@playwright/test";

const developmentPaths = ["/magic", "/screw-puzzle", "/banpick", "/stocks", "/stocks/chart"];

test("development capabilities stay out of navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "기타" }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "소셜" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "설정" })).toBeVisible();

  for (const path of developmentPaths) {
    await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
  }
});
