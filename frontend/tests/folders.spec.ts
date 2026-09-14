import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loginFiles } from "./auth";

test("folder picker uploads nested files and preserves existing roots", async ({
  page,
}, info) => {
  const folder = info.outputPath("folder-source");
  await mkdir(join(folder, "中文"), { recursive: true });
  await writeFile(join(folder, "中文", "nested.txt"), "folder bytes");
  await loginFiles(page);
  await page.getByLabel("選擇上傳資料夾").setInputFiles(folder);
  await page
    .getByRole("dialog", { name: "上傳資料夾", exact: true })
    .getByRole("button", { name: "開始上傳" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "上傳 nested.txt" })
      .getByText("完成", { exact: true }),
  ).toBeVisible();
  expect(
    await (
      await page.request.get(
        "/api/v1/files/download?path=folder-source/中文/nested.txt",
      )
    ).text(),
  ).toBe("folder bytes");
  await page
    .getByRole("dialog", { name: "工作進度" })
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await page.getByLabel("選擇上傳資料夾").setInputFiles(folder);
  await page
    .getByRole("dialog", { name: "上傳資料夾", exact: true })
    .getByRole("button", { name: "開始上傳" })
    .click();
  await expect(
    page.getByText("同名根目錄已略過，原有內容保持不變。"),
  ).toBeVisible();
});
