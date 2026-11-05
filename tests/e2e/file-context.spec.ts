import { test, expect } from './fixtures.js';
import { login, selectFile, chooseView, searchInput, fileAction } from './actions.js';

test('局部情境操作、三模式淡底選取與手機底部列不遮最後一項',async({page,workspaceData},info)=>{
  const path=await workspaceData.prepareLayout();await page.goto(`/?entry=${workspaceData.managed}&path=${encodeURIComponent(path)}`);await login(page);await expect(page.getByText('66 個項目',{exact:true})).toBeVisible();
  expect((await page.locator('tr[data-row-key]').filter({has:page.getByText('document-01.txt',{exact:true})}).boundingBox())?.height).toBeCloseTo((page.viewportSize()?.width??0)<=736?64:52,0);await page.screenshot({path:info.outputPath('normal-list.png'),animations:'disabled'});
  await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('group',{name:'選取操作',exact:true})).toHaveCount(0);
  await selectFile(page,'design');await selectFile(page,'document-01.txt');await expect(page.getByText('已選取 2 項',{exact:true})).toBeVisible();
  for(const mode of ['list','mosaic','thumbnails'] as const){
    await chooseView(page,mode);const selected=mode==='list'?page.locator('tr.file-selected').first():page.locator('.thumbnail-card.selected').first();
    await expect(selected).toBeVisible();await expect(mode==='list'?selected.locator('td').first():selected).toHaveCSS('background-color','rgb(234, 241, 251)');
    const text=selected.locator(mode==='list'?'.folder-link':'.thumbnail-name');await expect(text).toHaveCSS('color','rgb(32, 40, 50)');
    await page.screenshot({path:info.outputPath(`selected-${mode}.png`),animations:'disabled'});
  }
  await chooseView(page,'list');
  if((page.viewportSize()?.width??0)<=736){const tools=await page.getByRole('group',{name:'選取操作',exact:true}).boundingBox();expect(tools?.x).toBe(8);expect((tools?.y??0)+(tools?.height??0)).toBeLessThanOrEqual((page.viewportSize()?.height??0)-7);await page.locator('tr[data-row-key]').last().scrollIntoViewIfNeeded();expect((await page.locator('tr[data-row-key]').last().boundingBox())?.y).toBeLessThan(tools?.y??0);}
  await page.getByRole('button',{name:'清除選取',exact:true}).click();await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('右鍵與鍵盤功能相同、Escape 回焦點、Space 選取及搜尋返回',async({page,workspaceData},info)=>{
  await page.goto(`/?entry=${workspaceData.managed}`);await login(page);const row=page.locator('tr[data-row-key="readme.txt"]');await expect(row).toBeVisible();
  await row.click({button:'right'});await expect(page.getByRole('menu',{name:'檔案操作',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'下載 readme.txt',exact:true})).toBeEnabled();await page.screenshot({path:info.outputPath('context-menu.png'),animations:'disabled'});await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'分享所選項目',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('menu',{name:'檔案操作',exact:true})).toHaveCount(0);await expect(row).toBeFocused();
  await row.press('Shift+F10');await expect(page.getByRole('menu',{name:'檔案操作',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'預覽 readme.txt',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(row).toBeFocused();await page.getByRole('button',{name:'清除選取',exact:true}).click();await row.focus();await row.press('Space');await expect(page.getByLabel('選取 readme.txt',{exact:true})).toBeChecked();
  const more=page.getByRole('button',{name:'更多所選操作',exact:true});await more.click();await expect(more).toHaveAttribute('aria-expanded','true');await expect(page.getByRole('menuitem',{name:'分享所選項目',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(more).toHaveAttribute('aria-expanded','false');await expect(more).toBeFocused();
  const original=page.url();await (await searchInput(page)).fill('未送出');await expect(page.getByRole('main')).toHaveAttribute('inert','');await expect(page.getByLabel('搜尋名稱',{exact:true})).toBeFocused();await page.screenshot({path:info.outputPath('search-expanded.png'),animations:'disabled'});await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'搜尋檔案',exact:true})).toBeFocused();expect(page.url()).toBe(original);await expect(page.getByRole('main')).not.toHaveAttribute('inert','');
  await (await fileAction(page,'選取項目')).click();
});
