import { loginFiles as login } from "./auth";
import { test, expect } from "@playwright/test";

test("cut and paste shortcuts preserve input editing", async ({ page }) => {
  await login(page);
  await page.getByLabel("選擇上傳檔案").setInputFiles({
    name: "keyboard.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("keyboard contents"),
  });
  await expect(
    page
      .getByRole("region", { name: "上傳 keyboard.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page
    .getByRole("button", { name: "選取 keyboard.txt", exact: true })
    .click();
  const search = page.getByRole("textbox", { name: "搜尋目前資料夾" });
  await search.fill("keyboard");
  await search.press("ControlOrMeta+a");
  await search.press("Delete");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "選取 keyboard.txt", exact: true })
    .click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(
    page.getByRole("button", { name: "選取 keyboard.txt", exact: true }),
  ).toHaveCSS("opacity", "0.45");
  await page
    .getByRole("button", { name: "開啟 專案文件", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "專案文件", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+v");
  await page
    .getByRole("dialog", { name: "搬移項目" })
    .getByRole("button", { name: "確認執行" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("→ 專案文件/keyboard.txt", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "貼上", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "選取 keyboard.txt", exact: true }),
  ).toBeVisible();
});

test("trash and restore a file from the shared trash", async ({ page }) => {
  await login(page);
  await page
    .getByRole("button", { name: "選取 unsupported.zip", exact: true })
    .click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "移至垃圾桶", exact: true }).click();
  await page
    .getByRole("dialog", { name: "移至垃圾桶項目" })
    .getByRole("button", { name: "確認執行" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("已移至垃圾桶。", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "選取 unsupported.zip", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "資源回收筒", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "unsupported.zip" })
    .getByRole("button", { name: "還原此項目" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "還原到原位置" }),
  ).toBeChecked();
  await page
    .getByRole("dialog", { name: "還原項目" })
    .getByRole("button", { name: "確認執行" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("已還原。", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page.getByRole("link", { name: "所有檔案", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "選取 unsupported.zip", exact: true }),
  ).toBeVisible();
});

test("batch copy and move persist results after reload", async ({ page }) => {
  await login(page);
  await page
    .getByRole("button", { name: "選取 開始使用.txt", exact: true })
    .click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "複製到…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "複製項目" });
  await dialog.getByText("空資料夾", { exact: true }).click();
  await dialog.getByRole("button", { name: "確認執行" }).click();
  const drawer = page.getByRole("dialog", { name: "工作進度" });
  await expect(
    drawer.getByText("→ 空資料夾/開始使用.txt", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer
      .getByRole("region", { name: /^複製任務 / })
      .filter({ hasText: "→ 空資料夾/開始使用.txt" })
      .getByText("已完成。", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "工作進度", exact: true }).click();
  await page.getByRole("tab", { name: "檔案作業", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("→ 空資料夾/開始使用.txt", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page
    .getByRole("button", { name: "開啟 空資料夾", exact: true })
    .click();
  await page
    .getByRole("button", { name: "選取 開始使用.txt", exact: true })
    .click();
  await page.getByRole("button", { name: "移動到", exact: true }).click();
  const move = page.getByRole("dialog", { name: "搬移項目" });
  await move.getByText("專案文件", { exact: true }).click();
  await move.getByRole("button", { name: "確認執行" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "工作進度" })
      .getByText("→ 專案文件/開始使用.txt", { exact: true }),
  ).toBeVisible();
});
