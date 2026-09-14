import { loginFiles as login } from "./auth";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("cancel an in-flight upload without creating the destination", async ({
  page,
}) => {
  await login(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/files/upload?**", async (route) => {
    await gate;
    await route.abort();
  });
  await page.getByLabel("選擇上傳檔案").setInputFiles({
    name: "cancel.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("cancel data"),
  });
  const item = page.getByRole("region", { name: "上傳 cancel.txt" });
  await item.getByRole("button", { name: "取消", exact: true }).click();
  await expect(item.getByText("已停止", { exact: true })).toBeVisible();
  release();
  expect(
    (await page.request.get("/api/v1/files/download?path=cancel.txt")).status(),
  ).toBe(404);
});

test("multiple upload, context rename, selection and byte-exact download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.getByLabel("選擇上傳檔案").setInputFiles([
    {
      name: "上傳 O'Brien.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("uploaded bytes 中文"),
    },
    {
      name: "second.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from([0, 1, 2, 255]),
    },
  ]);
  await expect(
    page
      .getByRole("region", { name: "上傳 上傳 O'Brien.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "上傳 second.bin" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page
    .getByRole("button", { name: "選取 上傳 O'Brien.txt", exact: true })
    .click();
  await expect(page.getByText("已選取 1 個項目")).toBeVisible();
  await page
    .getByRole("button", { name: "選取 上傳 O'Brien.txt", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "重新命名" }).click();
  await page.getByLabel("新名稱").fill("改名 O'Brien.txt");
  await page.getByRole("button", { name: "儲存名稱" }).click();
  await expect(
    page.getByRole("button", { name: "選取 改名 O'Brien.txt", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "更多操作 改名 O'Brien.txt", exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下載", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("改名 O'Brien.txt");
  expect(await readFile((await download.path())!)).toEqual(
    Buffer.from("uploaded bytes 中文"),
  );
  await page
    .getByRole("button", { name: "選取 改名 O'Brien.txt", exact: true })
    .dblclick();
  await expect(
    page.getByText("uploaded bytes 中文", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("drag/drop upload and collision reports a failure without replacing content", async ({
  page,
}) => {
  await login(page);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(["drag contents"], "drag.txt", { type: "text/plain" }),
    );
    return data;
  });
  await page.locator("main").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    page
      .getByRole("region", { name: "上傳 drag.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page.getByLabel("選擇上傳檔案").setInputFiles({
    name: "drag.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("must not replace"),
  });
  await expect(
    page.getByText("同名項目已存在，請更改檔名後重試。"),
  ).toBeVisible();
  const response = await page.request.get(
    "/api/v1/files/content?path=drag.txt",
  );
  expect((await response.json()).content).toBe("drag contents");
});

test("upload can retry after a network failure", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/files/upload?**", (route) => route.abort(), {
    times: 1,
  });
  await page.getByLabel("選擇上傳檔案").setInputFiles({
    name: "retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("retry data"),
  });
  await expect(page.getByText("連線中斷，請確認網路後重試。")).toBeVisible();
  await page
    .getByRole("region", { name: "上傳 retry.txt" })
    .getByRole("button", { name: "重試" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "上傳 retry.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
});
