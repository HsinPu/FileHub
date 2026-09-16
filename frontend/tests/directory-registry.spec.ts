import { test, expect } from "@playwright/test";
import { loginFiles } from "./auth";

const headers = { "X-Requested-With": "Files-App" };
test("register nested directory in UI, rename, disable and recover persisted state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginFiles(page);
  for (const [path, name] of [
    ["", "nfs-registry"],
    ["nfs-registry", "reports"],
  ]) {
    expect(
      (
        await page.request.post("/api/v1/files/directory", {
          headers,
          data: { path, name },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto("/settings/directories");
  await page.getByRole("button", { name: "新增目錄", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增目錄", exact: true });
  await dialog.getByLabel("顯示名稱", { exact: true }).fill("巢狀報表");
  await dialog.getByRole("button", { name: "選擇資料夾" }).click();
  await dialog
    .getByRole("button", { name: "nfs-registry", exact: true })
    .click();
  await dialog.getByRole("button", { name: "reports", exact: true }).click();
  await dialog.getByRole("button", { name: "使用此資料夾" }).click();
  await expect(dialog.getByLabel("相對目錄", { exact: true })).toHaveValue(
    "nfs-registry/reports",
  );
  await dialog.getByRole("button", { name: "檢查目錄" }).click();
  await expect(dialog.getByRole("status")).toHaveText("可讀取");
  await dialog.getByRole("button", { name: "儲存目錄" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "編輯 巢狀報表", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "編輯目錄", exact: true });
  await expect(editor.getByLabel("相對目錄", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await editor.getByLabel("顯示名稱", { exact: true }).fill("年度報表");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(
      editor.getByRole("button", { name: "儲存目錄" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `../.cache/screenshots/registry-editor-${width}.png`,
      fullPage: true,
    });
  }
  await editor.getByRole("button", { name: "儲存目錄" }).click();
  await expect(editor).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole("button", { name: "停用 年度報表", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "停用共享入口？" });
  await expect(confirm).toContainText("settings-reader");
  await confirm.getByRole("button", { name: "確認停用" }).click();
  await expect(confirm).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "年度報表" }),
  ).toContainText("已停用");
  await page
    .getByRole("button", { name: "啟用 年度報表", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "重新啟用共享入口？" })
    .getByRole("button", { name: "確認啟用" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "年度報表" }),
  ).toContainText("已啟用");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.screenshot({
      path: `../.cache/screenshots/registry-list-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("nested grants bound breadcrumbs, parent navigation, copy destination and revocation", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  await loginFiles(page);
  for (const [path, name] of [
    ["", "nfs-nested"],
    ["nfs-nested", "reports"],
    ["nfs-nested/reports", "2026"],
    ["nfs-nested", "departments"],
    ["nfs-nested/departments", "it"],
    ["nfs-nested", "private"],
  ]) {
    expect(
      (
        await page.request.post("/api/v1/files/directory", {
          headers,
          data: { path, name },
        })
      ).status(),
    ).toBe(201);
  }
  expect(
    (
      await page.request.post(
        "/api/v1/files/upload?path=nfs-nested/reports/2026&name=report.txt",
        {
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          data: Buffer.from("report"),
        },
      )
    ).status(),
  ).toBe(201);
  const reports = await (
    await page.request.post("/api/v1/admin/directories", {
      headers,
      data: { name: "深層報表", path: "nfs-nested/reports" },
    })
  ).json();
  const work = await (
    await page.request.post("/api/v1/admin/directories", {
      headers,
      data: { name: "深層 IT", path: "nfs-nested/departments/it" },
    })
  ).json();
  const account = (
    await (
      await page.request.get("/api/v1/admin/accounts?q=nested-reader")
    ).json()
  )[0];
  expect(
    (
      await page.request.put(`/api/v1/admin/accounts/${account.id}`, {
        headers,
        data: {
          enabled: true,
          scope_mode: "multiple",
          directory_grants: [
            { directory_id: reports.id, permissions: ["browse", "read"] },
            {
              directory_id: work.id,
              permissions: ["browse", "read", "upload"],
            },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  const context = await browser.newContext({ baseURL });
  try {
    const reader = await context.newPage();
    const errors: string[] = [];
    reader.on("pageerror", (e) => errors.push(e.message));
    await reader.goto("/files");
    await reader.getByLabel("帳號", { exact: true }).fill("nested-reader");
    await reader.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
    await reader.getByRole("button", { name: "登入工作空間" }).click();
    await expect(
      reader.getByRole("heading", { name: "所有目錄", exact: true }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "開啟 深層報表", exact: true })
      .click();
    await expect(
      reader.getByRole("heading", { name: "深層報表", exact: true }),
    ).toBeVisible();
    await expect(reader.locator(".ant-breadcrumb")).not.toContainText(
      "nfs-nested",
    );
    await reader.getByRole("button", { name: /返回上一層/ }).click();
    await expect(
      reader.getByRole("heading", { name: "所有目錄", exact: true }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "開啟 深層報表", exact: true })
      .click();
    await reader
      .getByRole("button", { name: "開啟 2026", exact: true })
      .click();
    await reader
      .getByRole("button", { name: "選取 report.txt", exact: true })
      .click();
    await reader.getByRole("button", { name: "更多操作", exact: true }).click();
    await reader
      .getByRole("menuitem", { name: "複製到…", exact: true })
      .click();
    const dialog = reader.getByRole("dialog", { name: "複製項目" });
    await expect(
      dialog.getByRole("button", { name: "確認執行" }),
    ).toBeDisabled();
    await dialog.getByText("深層 IT", { exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "確認執行" }),
    ).toBeEnabled();
    await expect(dialog.locator(".ant-breadcrumb")).toContainText("深層 IT");
    await expect(dialog.locator(".ant-breadcrumb")).not.toContainText(
      "departments",
    );
    await dialog.getByRole("button", { name: "確認執行" }).click();
    await expect
      .poll(async () =>
        (
          await context.request.get(
            "/api/v1/files/download?path=nfs-nested/departments/it/report.txt",
          )
        ).status(),
      )
      .toBe(200);
    await reader.goto("/files");
    await expect(
      reader.getByRole("button", { name: "開啟 深層 IT", exact: true }),
    ).toBeVisible();
    for (const width of [1440, 768, 390]) {
      await reader.setViewportSize({ width, height: 960 });
      expect(
        await reader.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      await reader.screenshot({
        path: `../.cache/screenshots/nested-roots-${width}.png`,
        fullPage: true,
      });
    }
    expect(
      (await context.request.get("/api/v1/files?path=nfs-nested")).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`/api/v1/admin/directories/${reports.id}`, {
          headers,
          data: { revision: reports.revision, enabled: false },
        })
      ).status(),
    ).toBe(200);
    await reader.reload();
    await expect(
      reader.getByRole("heading", { name: "歡迎回來" }),
    ).toBeVisible();
    await reader.getByLabel("帳號", { exact: true }).fill("nested-reader");
    await reader.getByLabel("密碼", { exact: true }).fill("Browser-test-123");
    await reader.getByRole("button", { name: "登入工作空間" }).click();
    await expect(
      reader.getByRole("button", { name: "開啟 深層 IT", exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByRole("button", { name: "開啟 深層報表", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
