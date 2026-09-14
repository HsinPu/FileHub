import { test, expect } from "@playwright/test";
import { loginFiles } from "./auth";

test("password protected public share downloads and revocation blocks the grant", async ({
  page,
  browser,
}) => {
  await loginFiles(page);
  await page
    .getByRole("button", { name: "更多操作 開始使用.txt", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "分享", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("分享密碼（選填）", { exact: true })
    .fill("Share-browser-123");
  await dialog.getByRole("button", { name: /確.*定/ }).click();
  const link = dialog.getByLabel("分享連結");
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto(url);
    await recipient
      .getByLabel("分享密碼", { exact: true })
      .fill("Share-browser-123");
    await recipient
      .getByRole("button", { name: "開啟分享", exact: true })
      .click();
    await expect(
      recipient.getByRole("heading", { name: "開始使用.txt", exact: true }),
    ).toBeVisible();
    const pending = recipient.waitForEvent("download");
    await recipient.getByRole("button", { name: "下載檔案" }).click();
    expect((await pending).suggestedFilename()).toBe("開始使用.txt");
    await dialog.getByRole("button", { name: "完成", exact: true }).click();
    await page.getByRole("link", { name: "分享管理", exact: true }).click();
    await page.getByRole("button", { name: "撤銷分享", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "撤銷分享", exact: true }),
    ).toBeDisabled();
    await recipient.getByRole("button", { name: "下載檔案" }).click();
    await expect(
      recipient.getByText("無法下載，檔案可能已移除或沒有權限。"),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
