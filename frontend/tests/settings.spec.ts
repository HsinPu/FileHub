import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("settings replaces sidebar and returns to folder with search and view preserved", async ({
  page,
}) => {
  await loginFiles(page);
  await page
    .getByRole("button", { name: "開啟 專案文件", exact: true })
    .click();
  await page.getByLabel("搜尋目前資料夾").fill("需求");
  await page.getByText("縮圖", { exact: true }).click();
  await openSettings(page);
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await expect(
    page.getByRole("navigation", { name: "設定導覽" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "分享管理", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".topbar").getByRole("button", { name: "帳號選單" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "帳號資料", exact: true }).click();
  await page.getByRole("link", { name: "返回工作台" }).click();
  await expect(
    page.getByRole("heading", { name: "專案文件", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("搜尋目前資料夾")).toHaveValue("需求");
  await expect(page.getByLabel("縮圖清單", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "帳號資料", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("搜尋目前資料夾")).toHaveValue("需求");
});

test("legacy admin redirects, refresh and direct settings return safely", async ({
  page,
}) => {
  await loginFiles(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "帳號管理", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回工作台" }).click();
  await expect(page).toHaveURL(/\/files$/);
});

test("password edits guard navigation, history and logout; failed submit retains input", async ({
  page,
}) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByRole("link", { name: "密碼與登入", exact: true }).click();
  await page.getByLabel("目前密碼", { exact: true }).fill("wrong-password");
  await page.getByLabel("新密碼", { exact: true }).fill("New-password-123");
  await page
    .getByLabel("確認新密碼", { exact: true })
    .fill("different-password");
  await page.getByRole("button", { name: "更新密碼", exact: true }).click();
  await expect(page.getByText("兩次密碼不一致")).toBeVisible();
  await page.getByLabel("確認新密碼", { exact: true }).fill("New-password-123");
  await page.getByRole("button", { name: "更新密碼", exact: true }).click();
  await expect(page.getByText("目前密碼不正確。")).toBeVisible();
  await page.getByRole("link", { name: "返回工作台" }).click();
  await page.getByRole("button", { name: "繼續編輯", exact: true }).click();
  await expect(page.getByLabel("目前密碼", { exact: true })).toHaveValue(
    "wrong-password",
  );
  await page.getByRole("button", { name: "帳號選單", exact: true }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.getByRole("button", { name: "繼續編輯", exact: true }).click();
  await page.goBack();
  await page.getByRole("button", { name: "放棄變更", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await page.getByRole("link", { name: "密碼與登入", exact: true }).click();
  await expect(page.getByLabel("目前密碼", { exact: true })).toBeEmpty();
});

test("account search and edit cancellation preserve changes until discarded", async ({
  page,
}) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByLabel("搜尋帳號", { exact: true }).fill("settings-reader");
  await page.getByLabel("搜尋帳號", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "編輯 admin", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "編輯 settings-reader", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "編輯帳號", exact: true });
  await editor.getByLabel("顯示名稱").fill("尚未儲存");
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "繼續編輯", exact: true }).click();
  await expect(editor.getByLabel("顯示名稱")).toHaveValue("尚未儲存");
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "放棄變更", exact: true }).click();
  await expect(editor).not.toBeVisible();
});

test("regular account sees personal settings and admin URL/API are denied", async ({
  page,
}) => {
  await page.goto("/files");
  await page.getByLabel("帳號", { exact: true }).fill("settings-reader");
  await page.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
  await page.getByRole("button", { name: "登入工作空間" }).click();
  await expect(
    page.getByRole("button", { name: "帳號選單", exact: true }),
  ).toBeVisible();
  await openSettings(page);
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(
    page.getByRole("link", { name: "帳號管理", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings/accounts");
  await expect(page.getByText("無權限管理帳號", { exact: true })).toBeVisible();
  expect(
    (await page.request.get("/api/v1/admin/accounts?q=admin")).status(),
  ).toBe(403);
});

test("mobile settings swaps menu and returns to workspace", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginFiles(page);
  await openSettings(page);
  await expect(
    page.getByRole("heading", { name: "帳號管理", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "開啟設定選單" }).click();
  await expect(
    page.getByRole("navigation", { name: "設定導覽" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-settings-navigation.png"),
  });
  await page.getByRole("link", { name: "密碼與登入", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "設定", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "更新密碼", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("mobile-security.png") });
  await page.getByRole("button", { name: "返回工作台" }).click();
  await expect(page).toHaveURL(/\/files$/);
});
