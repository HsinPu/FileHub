import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("administrator creates scoped account, forced password change and read-only UI", async ({
  page,
  browser,
  baseURL,
}) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByRole("button", { name: "新增帳號", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("帳號", { exact: true }).fill("browser-reader");
  await dialog
    .getByLabel("初始密碼", { exact: true })
    .fill("Reader-initial-123");
  await dialog.getByRole("switch").click();
  await dialog.getByLabel("存取模式", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("單一根目錄", { exact: true })
    .click();
  await dialog.getByRole("button", { name: "選擇資料夾" }).click();
  await dialog.getByText("專案文件", { exact: true }).click();
  await dialog.getByLabel("瀏覽", { exact: true }).check();
  await dialog.getByLabel("讀取內容／下載", { exact: true }).check();
  await dialog.getByRole("button", { name: "儲存設定" }).click();
  await expect(
    page.getByRole("button", { name: "編輯 browser-reader", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({ baseURL });
  try {
    const reader = await context.newPage();
    await reader.goto("/files");
    await reader.getByLabel("帳號", { exact: true }).fill("browser-reader");
    await reader.getByLabel("密碼", { exact: true }).fill("Reader-initial-123");
    await reader.getByRole("button", { name: "登入工作空間" }).click();
    await expect(
      reader.getByRole("heading", { name: "請先修改初始密碼" }),
    ).toBeVisible();
    await reader
      .getByLabel("目前密碼", { exact: true })
      .fill("Reader-initial-123");
    await reader
      .getByLabel("新密碼", { exact: true })
      .fill("Reader-updated-123");
    await reader
      .getByLabel("確認新密碼", { exact: true })
      .fill("Reader-updated-123");
    await reader.getByRole("button", { name: "更新密碼", exact: true }).click();
    await expect(
      reader.getByRole("heading", { name: "歡迎回來" }),
    ).toBeVisible();
    await reader.getByLabel("帳號", { exact: true }).fill("browser-reader");
    await reader.getByLabel("密碼", { exact: true }).fill("Reader-updated-123");
    await reader.getByRole("button", { name: "登入工作空間" }).click();
    await expect(
      reader.getByRole("button", { name: "預覽 需求說明.md", exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByRole("button", { name: "上傳檔案", exact: true }),
    ).toBeDisabled();
    await expect(reader.getByRole("link", { name: "帳號管理" })).toHaveCount(0);
    expect((await context.request.get("/api/v1/files?path=../")).status()).toBe(
      400,
    );
    await page
      .getByRole("button", { name: "編輯 browser-reader", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await dialog.getByRole("button", { name: "儲存設定" }).click();
    await expect(dialog).not.toBeVisible();
    await reader.reload();
    await expect(
      reader.getByRole("heading", { name: "歡迎回來" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
