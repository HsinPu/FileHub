import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function login(
  page: Page,
  username = "admin",
  password = "Browser-test-123",
) {
  await page.getByLabel("帳號", { exact: true }).fill(username);
  await page.getByLabel("密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登入工作空間" }).click();
  await expect(
    page.getByRole("heading", { name: "所有檔案", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "預覽 開始使用.txt", exact: true }),
  ).toBeVisible();
}

test("browse, special filenames, preview, search, create, reload and logout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/files");
  await mkdir("../.cache/screenshots", { recursive: true });
  await page.screenshot({
    path: "../.cache/screenshots/login.png",
    fullPage: true,
  });
  await login(page);
  await page.screenshot({
    path: "../.cache/screenshots/workspace.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "開啟 中文 O'Brien", exact: true })
    .click();
  await page
    .getByRole("button", { name: "預覽 O'Brien.txt", exact: true })
    .click();
  await expect(
    page.getByText("特殊檔名測試 <script>alert(1)</script>", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "中文 O'Brien", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回上一層" }).click();
  await page.getByLabel("搜尋目前資料夾").fill("開始");
  await expect(
    page.getByRole("button", { name: "預覽 開始使用.txt" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "開啟 專案文件" })).toHaveCount(
    0,
  );
  await page.getByLabel("搜尋目前資料夾").fill("");
  await page.getByRole("button", { name: "新增資料夾", exact: true }).click();
  await page.getByLabel("資料夾名稱").fill("新資料夾 O'Brien");
  await page.getByRole("button", { name: "建立資料夾", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "開啟 新資料夾 O'Brien", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "預覽 預覽圖片.svg" }).click();
  await expect(
    page.getByRole("img", { name: "預覽圖片.svg", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "預覽圖片.svg", exact: true })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "預覽 unsupported.zip" }).click();
  await expect(page.getByText("此檔案格式不支援預覽。")).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "帳號選單" }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await expect(page.getByRole("heading", { name: "歡迎回來" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout and empty directory", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/files");
  await login(page);
  await page
    .getByRole("button", { name: "開啟 空資料夾", exact: true })
    .click();
  await expect(page.getByText("這個資料夾還沒有檔案")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.cache/screenshots/mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "開啟資料夾選單" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("wrong login and password change", async ({ page }) => {
  await page.goto("/files");
  await page.getByLabel("帳號", { exact: true }).fill("password-test");
  await page.getByLabel("密碼", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "登入工作空間" }).click();
  await expect(page.getByText("帳號或密碼錯誤。")).toBeVisible();
  await login(page, "password-test");
  await page.getByRole("button", { name: "帳號選單" }).click();
  await page.getByRole("menuitem", { name: "設定與管理" }).click();
  await page.getByRole("link", { name: "密碼與登入", exact: true }).click();
  await page.getByLabel("目前密碼", { exact: true }).fill("Browser-test-123");
  await page.getByLabel("新密碼", { exact: true }).fill("Changed-test-123");
  await page.getByLabel("確認新密碼", { exact: true }).fill("Changed-test-123");
  await page.getByRole("button", { name: "更新密碼", exact: true }).click();
  await expect(page.getByRole("heading", { name: "歡迎回來" })).toBeVisible();
  await page.goto("/files");
  await login(page, "password-test", "Changed-test-123");
});

test("late directory response cannot replace the current directory", async ({
  page,
}) => {
  await page.goto("/files");
  await login(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested: () => void = () => {};
  const observed = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/v1/files?path=*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("path") !== "專案文件")
      return route.continue();
    const response = await route.fetch();
    requested();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "開啟 專案文件", exact: true })
    .click();
  await observed;
  await page.getByRole("button", { name: "返回上一層" }).click();
  await expect(
    page.getByRole("button", { name: "預覽 開始使用.txt" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: "所有檔案", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "預覽 需求說明.md" }),
  ).toHaveCount(0);
});
