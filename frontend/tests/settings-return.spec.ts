import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("return restores file page and scroll and handles sharing/trash origins", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await loginFiles(page);
  await page.route("**/api/v1/files?path=*", async (route) => {
    await route.fulfill({
      json: {
        path: "",
        entries: Array.from({ length: 60 }, (_, i) => ({
          name: `return-${String(i).padStart(2, "0")}.txt`,
          path: `return-${i}.txt`,
          type: "file",
          size: i,
          modified: "2026-09-14T00:00:00Z",
        })),
      },
    });
  });
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await page.getByTitle("2", { exact: true }).click();
  const main = page.locator(".workspace-main");
  await main.evaluate((el) => {
    el.scrollTop = 200;
  });
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(200);
  await openSettings(page);
  await page.getByRole("link", { name: "返回工作台" }).click();
  await expect(page.getByTitle("2", { exact: true })).toHaveClass(
    /ant-pagination-item-active/,
  );
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(200);
  await page.unrouteAll({ behavior: "wait" });
  for (const [name, path] of [
    ["分享管理", "/shares"],
    ["資源回收筒", "/trash"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await openSettings(page);
    await page.getByRole("link", { name: "返回工作台" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.reload();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
});
