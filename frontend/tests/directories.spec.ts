import { test, expect } from "@playwright/test";
import { loginFiles } from "./auth";

test("directory management displays real status at desktop tablet and mobile sizes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginFiles(page);
  await page.goto("/settings/directories");
  await expect(page.getByRole("heading", { name: "目錄管理" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "可讀取", exact: true }).first(),
  ).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.getByRole("button", { name: "重新檢查" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `../.cache/screenshots/directories-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "重新檢查" }).click();
  await expect(page.getByRole("button", { name: "重新檢查" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("account scope status and permission presets update without granting share", async ({
  page,
}) => {
  await loginFiles(page);
  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "新增帳號", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("存取模式", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("單一根目錄", { exact: true })
    .click();
  await dialog.getByRole("button", { name: "選擇資料夾" }).click();
  await dialog.getByText("專案文件", { exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("可讀取");
  await dialog.getByRole("combobox", { name: "權限範本" }).click();
  await page.getByText("唯讀", { exact: true }).click();
  await expect(dialog.getByLabel("瀏覽", { exact: true })).toBeChecked();
  await expect(
    dialog.getByLabel("讀取內容／下載", { exact: true }),
  ).toBeChecked();
  await expect(dialog.getByLabel("分享", { exact: true })).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "儲存設定" })).toBeEnabled();
  await page.screenshot({
    path: "../.cache/screenshots/directory-account.png",
    fullPage: true,
  });
});

test("multi-directory editor saves separate grants and remains usable at three widths", async ({
  page,
}) => {
  await loginFiles(page);
  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "新增帳號", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("帳號", { exact: true }).fill("multi-created");
  await dialog
    .getByLabel("初始密碼", { exact: true })
    .fill("Multi-initial-123");
  await dialog.getByLabel("存取模式", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("多目錄授權", { exact: true })
    .click();
  await dialog.getByRole("button", { name: "新增目錄授權" }).click();
  await dialog.getByRole("combobox", { name: "授權目錄 1" }).click();
  await page.getByText("專案文件（專案文件）", { exact: true }).click();
  await dialog.getByRole("button", { name: "新增目錄授權" }).click();
  await dialog.getByRole("combobox", { name: "授權目錄 2" }).click();
  await page
    .getByText("工作目錄（空資料夾）", { exact: true })
    .filter({ visible: true })
    .click();
  await dialog
    .getByTestId("directory-grant-1")
    .getByLabel("上傳／建目錄", { exact: true })
    .check();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(
      dialog.getByRole("button", { name: "儲存設定" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `../.cache/screenshots/multi-editor-${width}.png`,
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "儲存設定" }).click();
  await expect(dialog).not.toBeVisible();
  const accounts = await (
    await page.request.get("/api/v1/admin/accounts?q=multi-created")
  ).json();
  expect(accounts[0].directory_grants).toHaveLength(2);
  expect(
    accounts[0].directory_grants.find(
      (g: { directory_id: string }) => g.directory_id === "projects",
    ).permissions,
  ).not.toContain("upload");
});

test("multi-directory user sees granted roots and current directory capabilities", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/files");
  await page.getByLabel("帳號", { exact: true }).fill("multi-reader");
  await page.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
  await page.getByRole("button", { name: "登入工作空間" }).click();
  await expect(
    page.getByRole("heading", { name: "所有目錄", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeDisabled();
  expect(
    (await (await page.request.get("/api/v1/files")).json()).entries
      .map((e: { path: string }) => e.path)
      .sort(),
  ).toEqual(["專案文件", "空資料夾"].sort());
  await page.goto("/files?path=" + encodeURIComponent("專案文件"));
  await expect(
    page.getByRole("button", { name: "預覽 需求說明.md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeDisabled();
  await page.goto("/files?path=" + encodeURIComponent("空資料夾"));
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "../.cache/screenshots/multi-workspace.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("multi-directory copy dialog rejects read-only destination and copies to writable directory", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/files");
  await page.getByLabel("帳號", { exact: true }).fill("multi-reader");
  await page.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
  await page.getByRole("button", { name: "登入工作空間" }).click();
  await page
    .getByRole("button", { name: "開啟 專案文件", exact: true })
    .click();
  await page
    .getByRole("button", { name: "選取 需求說明.md", exact: true })
    .click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "複製到…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "複製項目" });
  await expect(
    dialog.getByText("此目的地沒有所需權限，請選擇其他目錄。"),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "確認執行" })).toBeDisabled();
  await dialog.getByText("工作目錄", { exact: true }).click();
  await expect(dialog.getByRole("button", { name: "確認執行" })).toBeEnabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(
      dialog.getByRole("button", { name: "確認執行" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `../.cache/screenshots/multi-copy-${width}.png`,
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "確認執行" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("→ 空資料夾/需求說明.md", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (
        await page.request.get(
          "/api/v1/files/download?path=" +
            encodeURIComponent("空資料夾/需求說明.md"),
        )
      ).status(),
    )
    .toBe(200);
  expect(errors).toEqual([]);
});
