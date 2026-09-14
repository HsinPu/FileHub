import { test, expect } from "@playwright/test";
import { loginFiles, openSettings } from "./auth";

test("account drawer is wider, draggable, keyboard resizable and responsive", async ({
  page,
}) => {
  await loginFiles(page);
  await openSettings(page);
  await page.getByRole("button", { name: "新增帳號", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "新增帳號", exact: true });
  const handle = page.getByRole("separator", { name: "調整側邊面板寬度" });
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(800);
  await drawer.getByLabel("帳號", { exact: true }).fill("unsaved-resize");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 196, box.y + 200, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(1000);
  await expect(drawer.getByLabel("帳號", { exact: true })).toHaveValue(
    "unsaved-resize",
  );
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "968");
  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "800");
  await page.setViewportSize({ width: 768, height: 960 });
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(720);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(390);
  await expect(
    drawer.getByRole("button", { name: "儲存設定" }),
  ).toBeInViewport();
  await drawer.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "放棄變更", exact: true }).click();
});
