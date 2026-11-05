import { test, expect } from './fixtures.js';
import { login, openSettings, selectFile, chooseView, fileAction } from './actions.js';

test('66 項資料的列表／圖磚／圖庫共用選取、空目錄及長名稱', async ({ page, workspaceData }, info) => {
  const path = await workspaceData.prepareLayout();
  await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`); await login(page);
  await expect(page.getByText('66 個項目', { exact: true })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const row = page.locator('tr[data-row-key]').first(); expect((await row.boundingBox())?.height).toBeCloseTo((page.viewportSize()?.width??0)<=736?64:52,0);
  await page.screenshot({ path: info.outputPath('list.png'), animations:'disabled' });
  await selectFile(page,'design');
  for (const [name,icon] of [['圖磚',36],['圖庫',(page.viewportSize()?.width??0)<=736?40:56]] as const) {
    await chooseView(page,name==='圖磚'?'mosaic':'thumbnails'); const grid=page.getByRole('list',{name:`${name}檢視`,exact:true});
    await expect(grid.getByRole('listitem')).toHaveCount(50); await expect(grid.getByLabel('選取 design',{exact:true})).toBeChecked();
    expect((await grid.locator('.file-kind').first().boundingBox())?.width).toBe(icon);
    if(name==='圖磚'){
      const check=await grid.getByLabel('選取 design',{exact:true}).evaluate(input=>input.closest('label')?.getBoundingClientRect().right);
      const image=await grid.locator('.thumbnail-image').first().boundingBox();
      expect(check).toBeDefined();expect(image).not.toBeNull();expect(check??Infinity).toBeLessThanOrEqual(image?.x??0);
    }
    if(name==='圖磚')expect((await grid.locator('.thumbnail-card').first().boundingBox())?.height).toBeGreaterThanOrEqual(88);else expect((await grid.locator('.thumbnail-image').first().boundingBox())?.height).toBe((page.viewportSize()?.width??0)<=736?112:144);
    await page.screenshot({path:info.outputPath(name==='圖磚'?'mosaic-selected.png':'gallery-selected.png'),animations:'disabled'});
  }
  await page.getByRole('button',{name:'清除選取',exact:true}).click();
  await chooseView(page,'mosaic');await page.screenshot({path:info.outputPath('mosaic.png'),animations:'disabled'});
  await chooseView(page,'thumbnails');await page.screenshot({path:info.outputPath('gallery.png'),animations:'disabled'});
  await page.getByRole('button',{name:'開啟 design',exact:true}).click();await expect(page.getByText('這個資料夾目前是空的。',{exact:true})).toBeVisible();
  await page.goBack();await page.getByRole('button',{name:'長名稱',exact:true}).click();await expect(page.getByText('4 個項目',{exact:true})).toBeVisible();
  for(const name of ['圖磚','圖庫']){
    await chooseView(page,name==='圖磚'?'mosaic':'thumbnails');await expect(page.getByAltText('image.png 縮圖',{exact:true})).toBeVisible();
    expect(await page.locator('body,main,.file-panel,.thumbnail-grid,.thumbnail-card').evaluateAll(elements=>elements.filter(element=>element.scrollWidth>element.clientWidth+1).length)).toBe(0);
    if(name==='圖庫')expect((await page.locator('.gallery-grid .thumbnail-image').first().boundingBox())?.height).toBe((page.viewportSize()?.width??0)<=736?112:144);
    await page.screenshot({path:info.outputPath(name==='圖磚'?'mosaic-long.png':'gallery-long.png'),fullPage:true,animations:'disabled'});
  }
});

test('圖磚偏好與筆數經 API 保存，重新整理保留；圖庫沿用 thumbnails 值',async({page,workspaceData})=>{
  const path=await workspaceData.prepareLayout();await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);await login(page);await openSettings(page);
  await page.getByLabel('預設檢視',{exact:true}).selectOption('mosaic');await page.getByLabel('每頁筆數',{exact:true}).selectOption('25');await page.getByRole('button',{name:'儲存偏好',exact:true}).click();await expect(page.getByText('設定已儲存。',{exact:true})).toBeVisible();
  expect(await(await page.request.get('/api/settings')).json()).toEqual({defaultView:'mosaic',pageSize:25});
  await page.getByRole('button',{name:'返回檔案',exact:true}).click();await expect(page.getByRole('list',{name:'圖磚檢視',exact:true}).getByRole('listitem')).toHaveCount(25);
  await page.getByRole('listitem',{name:'3',exact:true}).click();await expect(page.getByRole('list',{name:'圖磚檢視',exact:true}).getByRole('listitem')).toHaveCount(16);await page.reload();await expect((await fileAction(page,'切換檢視'))).toHaveAttribute('data-view','mosaic');
  await openSettings(page);await page.getByLabel('預設檢視',{exact:true}).selectOption('thumbnails');await page.getByRole('button',{name:'儲存偏好',exact:true}).click();await expect(page.getByText('設定已儲存。',{exact:true})).toBeVisible();
  expect(await(await page.request.get('/api/settings')).json()).toEqual({defaultView:'thumbnails',pageSize:25});
});
