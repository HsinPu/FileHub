import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("personal settings responsive layout and password clear state", async ({
  page,
}, info) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByRole("link", { name: "帳號資料", exact: true }).click();
  await expect(page.getByRole("link", { name: "前往帳號管理" })).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: info.outputPath(`profile-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("link", { name: "密碼與登入", exact: true }).click();
  const submit = page.getByRole("button", { name: "更新密碼", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel("目前密碼", { exact: true }).fill("test-only");
  await page.getByLabel("新密碼", { exact: true }).fill("new-password");
  await page.getByLabel("確認新密碼", { exact: true }).fill("different");
  await submit.click();
  await expect(page.getByText("兩次密碼不一致", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除輸入", exact: true }).click();
  await expect(page.getByLabel("目前密碼", { exact: true })).toHaveValue("");
  await expect(submit).toBeDisabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: info.outputPath(`security-${width}.png`),
      fullPage: true,
    });
  }
});
