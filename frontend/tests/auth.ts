import { expect, type BrowserContext, type Page } from "@playwright/test";

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;

// File-flow cases share a login session, while each page/context remains isolated.
// workspace.spec.ts separately verifies login, logout and password changes.
export async function loginFiles(page: Page) {
  if (cookies) await page.context().addCookies(cookies);
  await page.goto("/files");
  if (!cookies) {
    await page.getByLabel("帳號", { exact: true }).fill("admin");
    await page.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
    await page.getByRole("button", { name: "登入工作空間" }).click();
  }
  await expect(
    page.getByRole("button", { name: "上傳檔案", exact: true }),
  ).toBeEnabled();
  cookies = await page.context().cookies();
}

export async function openSettings(page: Page) {
  if (
    !(await page
      .getByRole("button", { name: "帳號選單", exact: true })
      .isVisible())
  ) {
    await page.getByRole("button", { name: /開啟.*選單/ }).click();
  }
  await page.getByRole("button", { name: "帳號選單", exact: true }).click();
  await page.getByRole("menuitem", { name: "設定與管理" }).click();
}
