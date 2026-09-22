import { test, expect, type Route } from "@playwright/test";
import { loginFiles } from "./auth";

test("inventory timeout permits retry and ignores late results", async ({
  page,
}, info) => {
  await loginFiles(page);
  const original = await (
    await page.request.get("/api/v1/admin/directories")
  ).json();
  let first: Route | undefined;
  let requests = 0;
  await page.route("**/api/v1/admin/directories", (route) => {
    requests++;
    if (requests === 1) first = route;
    else return route.continue();
  });
  await page.goto("/settings/directories");
  await expect(page.getByRole("button", { name: /檢查中…/ })).toBeVisible();
  await expect(page.getByText(/尚未取得結果；這不代表目錄離線/)).toBeVisible({
    timeout: 12000,
  });
  expect(requests).toBe(1);
  await page.screenshot({
    path: info.outputPath("diagnostics-timeout-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("diagnostics-timeout-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "重試檢查", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "編輯 專案文件", exact: true }),
  ).toBeVisible();
  original.items[0].name = "過期結果";
  await first!.fulfill({ json: original }).catch(() => {});
  await expect(
    page.getByRole("button", { name: "編輯 過期結果", exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(2);
});

test("individual check times out, clears on path change and retries", async ({
  page,
}) => {
  await loginFiles(page);
  await page.goto("/settings/directories");
  await page.getByRole("button", { name: "新增目錄", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "新增目錄", exact: true });
  await editor.getByLabel("相對目錄", { exact: true }).fill("專案文件");
  let first: Route | undefined;
  let requests = 0;
  await page.route("**/api/v1/admin/directory-status?*", (route) => {
    requests++;
    if (requests === 1) first = route;
    else return route.continue();
  });
  await editor.getByRole("button", { name: "檢查目錄", exact: true }).click();
  await expect(editor.getByText(/尚未取得結果；這不代表目錄離線/)).toBeVisible({
    timeout: 12000,
  });
  await editor.getByLabel("相對目錄", { exact: true }).fill("空資料夾");
  await expect(editor.getByText(/尚未取得結果/)).toHaveCount(0);
  await editor.getByRole("button", { name: "檢查目錄", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("可讀取");
  await first!
    .fulfill({
      json: {
        path: "專案文件",
        status: "missing",
        writable: false,
        cross_device: null,
      },
    })
    .catch(() => {});
  await expect(editor.getByRole("status")).toHaveText("可讀取");
  expect(requests).toBe(2);
});

test("failed inventory request provides a recoverable error", async ({
  page,
}) => {
  await loginFiles(page);
  await page.route("**/api/v1/admin/directories", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "檢查暫時失敗" } },
    }),
  );
  await page.goto("/settings/directories");
  await expect(page.getByText("檢查暫時失敗", { exact: true })).toBeVisible();
  await page.unroute("**/api/v1/admin/directories");
  await page.getByRole("button", { name: "重試檢查", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "編輯 專案文件", exact: true }),
  ).toBeVisible();
});
