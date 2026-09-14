import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loginFiles } from "./auth";

test("folder ZIP is generated and downloaded from its task", async ({
  page,
}) => {
  await loginFiles(page);
  await page
    .getByRole("button", { name: "選取 專案文件", exact: true })
    .click();
  await page.getByRole("button", { name: "打包下載 ZIP", exact: true }).click();
  await page
    .getByRole("dialog", { name: "ZIP 打包項目", exact: true })
    .getByRole("button", { name: "確認執行" })
    .click();
  const downloadButton = page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "下載 ZIP" });
  await expect(downloadButton).toBeVisible();
  const pending = page.waitForEvent("download");
  await downloadButton.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const data = await readFile((await download.path())!);
  expect(data.subarray(0, 2).toString()).toBe("PK");
});
