import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("upload remains alive across management routes and browser history", async ({
  page,
}) => {
  await loginFiles(page);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observed = new Promise<void>((resolve) => {
    started = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/files/upload?**", async (route) => {
    requests++;
    started();
    await gate;
    await route.continue();
  });
  await page.getByLabel("選擇上傳檔案").setInputFiles({
    name: "phase5-persistent.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("persistent upload"),
  });
  await observed;
  const tasks = page.getByRole("dialog", { name: "工作進度" });
  await tasks.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("link", { name: "分享管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "分享管理", exact: true }),
  ).toBeVisible();
  await openSettings(page);
  await expect(
    page.getByRole("heading", { name: "帳號管理", exact: true }),
  ).toBeVisible();
  release();
  await page.getByRole("button", { name: /工作進度/ }).click();
  await expect(
    tasks
      .getByRole("region", { name: "上傳 phase5-persistent.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(
    await (
      await page.request.get(
        "/api/v1/files/download?path=phase5-persistent.txt",
      )
    ).text(),
  ).toBe("persistent upload");
  await tasks.getByRole("button", { name: "關閉", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "分享管理", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", {
      name: "選取 phase5-persistent.txt",
      exact: true,
    }),
  ).toBeVisible();
});

test("selection clears after search and list/grid have the same desktop opening behavior", async ({
  page,
}) => {
  await loginFiles(page);
  await page
    .getByRole("button", { name: "選取 開始使用.txt", exact: true })
    .click();
  await expect(
    page.getByText("已選取 1 個項目", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜尋目前資料夾").fill("不存在的名稱");
  await expect(page.getByText("已選取 1 個項目", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "清除搜尋", exact: true }).click();
  await page.getByText("縮圖", { exact: true }).click();
  const entry = page
    .getByLabel("縮圖清單", { exact: true })
    .getByRole("button", { name: "預覽 開始使用.txt", exact: true });
  await entry.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("已選取 1 個項目", { exact: true }),
  ).toBeVisible();
  await entry.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await entry.click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("已選取 1 個項目", { exact: true })).toHaveCount(
    0,
  );
});

test("shift selection follows visible order and only selects the current page", async ({
  page,
}) => {
  await loginFiles(page);
  await page.route("**/api/v1/files?path=*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        entries: Array.from({ length: 25 }, (_, i) => ({
          name: `selection-${String(i).padStart(2, "0")}.txt`,
          path: `selection-${String(i).padStart(2, "0")}.txt`,
          type: "file",
          size: i,
          modified: "2026-09-14T00:00:00Z",
        })),
      },
    });
  });
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await page
    .getByRole("button", { name: "選取 selection-00.txt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "選取 selection-03.txt", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(
    page.getByText("已選取 4 個項目", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "分享", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.getByTitle("2", { exact: true }).click();
  await expect(page.getByText("已選取 4 個項目", { exact: true })).toHaveCount(
    0,
  );
  await page.locator("thead").getByRole("checkbox").check();
  await expect(
    page.getByText("已選取 5 個項目", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "分享管理", exact: true }).click();
  await page.getByRole("link", { name: "所有檔案", exact: true }).click();
  await expect(page.getByText("已選取 5 個項目", { exact: true })).toHaveCount(
    0,
  );
});

test("mobile tap opens files and explicit selection keeps actions in the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginFiles(page);
  await page
    .getByRole("button", { name: "選取 開始使用.txt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page.getByRole("button", { name: "選取", exact: true }).click();
  await page
    .getByRole("button", { name: "選取 開始使用.txt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("已選取 1 個項目", { exact: true }),
  ).toBeVisible();
  const box = await page.locator(".selection-toolbar").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("mobile-selected.png"),
    fullPage: true,
  });
});

test("desktop and tablet management layouts share navigation without overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginFiles(page);
  for (const width of [1440, 1280, 768]) {
    await page.setViewportSize({ width, height: 960 });
    for (const [url, title] of [
      ["/files", "所有檔案"],
      ["/shares", "分享管理"],
      ["/trash", "資源回收筒"],
      ["/settings/accounts", "帳號管理"],
    ]) {
      if (page.url().includes("/settings/"))
        await page.getByRole("link", { name: "返回工作台" }).click();
      if (title === "帳號管理") await openSettings(page);
      else await page.getByRole("link", { name: title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${url}$`));
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: info.outputPath(`${width}-${title}.png`),
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});

test("mobile account actions and root picker stay accessible", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginFiles(page);
  await page.getByRole("button", { name: "開啟資料夾選單" }).click();
  await openSettings(page);
  await expect(
    page.getByRole("heading", { name: "帳號管理", exact: true }),
  ).toBeVisible();
  const edit = page.getByRole("button", { name: "編輯 admin", exact: true });
  await expect(edit).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("mobile-accounts.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "新增帳號", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "新增帳號", exact: true });
  await drawer.getByRole("button", { name: "選擇資料夾" }).click();
  await drawer.getByText("所有檔案", { exact: true }).click();
  await expect(
    drawer.getByRole("textbox", { name: "指定根目錄", exact: true }),
  ).toHaveValue("所有檔案");
  await drawer.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "放棄變更", exact: true }).click();
  await expect(drawer).not.toBeVisible();
});
