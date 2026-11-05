import { test, expect } from './fixtures.js';
import { login, selectFile } from './actions.js';

test('960px 圖片全視窗預覽、工具可達；分享短表單置中並返回焦點',async({page,workspaceData},info)=>{
  const path=await workspaceData.preparePreviewScene();await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);await login(page);
  const trigger=page.getByRole('button',{name:'預覽 viewport.png',exact:true});await trigger.click();const modal=page.getByRole('dialog');const image=modal.getByAltText('viewport.png',{exact:true});await expect(image).toBeVisible();await expect(image).toHaveJSProperty('naturalWidth',960);
  // 圖片可見時可能仍在 ant-zoom 進場；量測完成後的視窗，不讀中間縮放矩形。
  await expect(modal).not.toHaveClass(/ant-zoom-(appear|enter)/);
  const viewport=page.viewportSize();if(!viewport)throw Error('缺少視窗');expect(await modal.boundingBox()).toMatchObject({x:0,y:0,width:viewport.width,height:viewport.height});
  const bounds=await image.boundingBox();if(!bounds)throw Error('缺少圖片');expect(bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.height).toBeLessThanOrEqual(viewport.height-64);expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(64);
  for(const name of ['關閉預覽','重試預覽','預覽資訊']){const button=modal.getByRole('button',{name,exact:true});await expect(button).toBeVisible();expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:info.outputPath('fullscreen-image.png'),animations:'disabled'});await modal.getByRole('button',{name:'關閉預覽',exact:true}).click();await expect(modal).toHaveCount(0);await expect(trigger).toBeFocused();
  await selectFile(page,'viewport.png');const share=page.getByRole('button',{name:'分享所選項目',exact:true});await share.click();await expect(modal).toBeVisible();await expect(modal).not.toHaveClass(/ant-zoom-(appear|enter)/);const box=await modal.boundingBox();if(!box)throw Error('缺少短表單');expect(box.width).toBeLessThanOrEqual(400);expect(Math.abs(box.x+box.width/2-viewport.width/2)).toBeLessThanOrEqual(1);expect(Math.abs(box.y+box.height/2-viewport.height/2)).toBeLessThanOrEqual(16);
  if(viewport.width<=736){expect((await modal.locator('.ant-input-affix-wrapper').boundingBox())?.height).toBe(44);await expect(modal.getByLabel('分享密碼（選填，15–128 字元）',{exact:true})).toHaveCSS('font-size','16px');}
  await page.screenshot({path:info.outputPath('share-form.png'),animations:'disabled'});await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(share).toBeFocused();
});
