import { test, expect } from "@playwright/test";
import { loginFiles } from "./auth";

test("PDF renders two different pages and grid images navigate", async ({
  page,
}) => {
  await loginFiles(page);
  await page
    .getByRole("button", { name: "預覽 兩頁文件.pdf", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-rendered="true"] canvas')).toBeVisible();
  const pixel = () =>
    dialog
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) =>
        Array.from(
          canvas
            .getContext("2d")!
            .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
        ),
      );
  expect(await pixel()).toEqual([255, 0, 0, 255]);
  await dialog.getByRole("button", { name: "PDF 下一頁" }).click();
  await expect(dialog.locator('[data-rendered="true"] canvas')).toHaveAttribute(
    "aria-label",
    "PDF 第 2 頁",
  );
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  await dialog.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByText("縮圖", { exact: true }).click();
  const grid = page.getByLabel("縮圖清單", { exact: true });
  await expect(
    grid.getByRole("img", { name: "預覽圖片.svg", exact: true }),
  ).toBeVisible();
  expect(
    await grid
      .getByRole("img", { name: "預覽圖片.svg", exact: true })
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBe(320);
  await grid
    .getByRole("button", { name: "預覽 第二張.svg", exact: true })
    .dblclick();
  await expect(
    dialog.getByRole("img", { name: "第二張.svg", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "下一張圖片" }).click();
  await expect(
    dialog.getByRole("img", { name: "預覽圖片.svg", exact: true }),
  ).toBeVisible();
});
