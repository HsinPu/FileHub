import { test, expect, type Route } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("non-file routes do not load files and returning refreshes permissions", async ({
  page,
}) => {
  await loginFiles(page);
  let listings = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/files") listings++;
  });
  for (const [path, title] of [
    ["/settings/accounts", "帳號管理"],
    ["/shares", "分享管理"],
    ["/trash", "資源回收筒"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(listings).toBe(0);
  }
  await page.getByRole("link", { name: "所有檔案", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeEnabled();
  expect(listings).toBe(1);
  await openSettings(page);
  const pending = new Promise<Route>((resolve) =>
    page.route("**/api/v1/files?path=*", resolve),
  );
  await page.getByRole("link", { name: "返回工作台" }).click();
  const route = await pending;
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeDisabled();
  await route.continue();
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeEnabled();
});

test("leaving a slow directory cannot replace the newer root listing", async ({
  page,
}) => {
  await loginFiles(page);
  let arrived!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/files?path=*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("path") !== "專案文件")
      return route.continue();
    arrived();
    await held;
    await route
      .fulfill({
        json: { path: "專案文件", entries: [], permissions: ["browse"] },
      })
      .catch(() => {});
  });
  await page
    .getByRole("button", { name: "開啟 專案文件", exact: true })
    .click();
  await started;
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "預覽 開始使用.txt", exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "所有檔案", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeEnabled();
});

test("upload survives settings navigation without background file listings", async ({
  page,
}) => {
  await loginFiles(page);
  const pending = new Promise<Route>((resolve) =>
    page.route("**/api/v1/files/upload?*", resolve),
  );
  await page.getByLabel("選擇上傳檔案", { exact: true }).setInputFiles({
    name: "cross-page-upload.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("upload survives"),
  });
  const route = await pending;
  const tasks = page.getByRole("dialog", { name: "工作進度", exact: true });
  await tasks.getByRole("button", { name: "關閉", exact: true }).click();
  await openSettings(page);
  await expect(
    page.getByRole("heading", { name: "帳號管理", exact: true }),
  ).toBeVisible();
  let listings = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/files") listings++;
  });
  await route.continue();
  await page.getByRole("button", { name: "工作進度", exact: true }).click();
  await expect(
    tasks.getByText("cross-page-upload.txt", { exact: true }),
  ).toBeVisible();
  await expect(tasks.getByText("完成", { exact: true })).toBeVisible();
  expect(listings).toBe(0);
});
