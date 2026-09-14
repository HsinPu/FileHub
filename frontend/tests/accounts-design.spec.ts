import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("account editor preserves clean state and adapts fields to role and width", async ({
  page,
}, info) => {
  await loginFiles(page);
  await openSettings(page);
  await page.screenshot({
    path: info.outputPath("accounts-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "編輯 admin", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "編輯帳號", exact: true });
  const save = drawer.getByRole("button", { name: "儲存設定" });
  await expect(save).toBeDisabled();
  await expect(
    drawer.getByText("管理員可管理所有檔案與帳號", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: "選擇資料夾" })).toHaveCount(
    0,
  );
  const name = drawer.getByLabel("顯示名稱", { exact: true });
  const original = await name.inputValue();
  await name.fill("changed");
  await expect(save).toBeEnabled();
  await name.fill(original);
  await expect(save).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("editor-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.locator(".account-form-grid")).toHaveCSS(
    "grid-template-columns",
    /^(\d+(\.\d+)?px)$/,
  );
  await page.screenshot({
    path: info.outputPath("editor-mobile.png"),
    fullPage: true,
  });
  await drawer.getByRole("button", { name: "取消", exact: true }).click();
  await expect(drawwerFallback(page)).toHaveCount(0);
});
function drawwerFallback(page: import("@playwright/test").Page) {
  return page.getByText("放棄尚未儲存的變更？", { exact: true });
}

test("filters recover empty results and role switches preserve scope", async ({
  page,
}, info) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByRole("combobox", { name: "篩選角色" }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("一般使用者", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "編輯 admin", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "編輯 settings-reader", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "篩選狀態" }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("停用", { exact: true })
    .click();
  await expect(
    page.getByText("找不到符合條件的帳號", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "清除篩選", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "編輯 settings-reader", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "編輯帳號", exact: true });
  await expect(drawer.getByLabel("指定根目錄", { exact: true })).toHaveValue(
    "所有檔案",
  );
  await drawer.getByLabel("角色", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("管理員", { exact: true })
    .click();
  await expect(drawer.getByRole("button", { name: "選擇資料夾" })).toHaveCount(
    0,
  );
  await drawer.getByLabel("角色", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("一般使用者", { exact: true })
    .click();
  await expect(drawer.getByLabel("指定根目錄", { exact: true })).toHaveValue(
    "所有檔案",
  );
  await expect(drawer.getByLabel("瀏覽", { exact: true })).toBeChecked();
  await expect(drawer.getByRole("button", { name: "儲存設定" })).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("user-editor.png"),
    fullPage: true,
  });
});
