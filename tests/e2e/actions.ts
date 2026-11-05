import { expect, type Page } from '@playwright/test';
import { fixturePassword } from './fixtures.js';

export async function login(page: Page, username = 'admin') {
  await expect(page.getByRole('heading', { name: '登入 FileHub' })).toBeVisible();
  await page.getByLabel('帳號', { exact: true }).fill(username);
  await page.getByLabel('密碼', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: '登入', exact: true }).click();
  await expect(page.getByRole('button', { name: '帳號選單', exact: true })).toBeVisible();
}

export async function goPath(page: Page, path: string) {
  await closeTasks(page);
  const trigger = page.getByRole('button', { name: '前往路徑', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await page.getByLabel('相對路徑', { exact: true }).fill(path);
  await page.getByRole('button', { name: '前往', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(path);
}

export async function selectionAction(page: Page, name: string) {
  const direct = page.getByRole('button', { name, exact: true });
  if (await direct.isVisible()) return direct;
  const item = page.getByRole('menuitem', { name, exact: true });
  const trigger=page.getByRole('button', { name: '更多所選操作', exact: true });
  if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded','true');
  await expect(item).toBeVisible();
  return item;
}

export async function resourceAction(page: Page, name: string) {
  const direct = page.getByRole('button', { name: `下載 ${name}`, exact: true });
  const more = page.getByRole('button', { name: `更多操作 ${name}`, exact: true });
  await expect.poll(async () => await direct.isVisible() || await more.isVisible()).toBe(true);
  if (await direct.isVisible()) return direct;
  const item = page.getByRole('menuitem', { name: `下載 ${name}`, exact: true });
  if (!await item.isVisible()) await more.click();
  return item;
}

export async function searchInput(page: Page) {
  const input = page.getByLabel('搜尋名稱', { exact: true });
  if (!await input.isVisible()) await page.getByRole('button', { name: '搜尋檔案', exact: true }).click();
  await input.focus();
  return input;
}

export async function clearSearch(page: Page) {
  await searchInput(page);
  await page.getByRole('button', { name: '清除搜尋', exact: true }).click();
}

export async function accountAction(page: Page, name: string) {
  await closeTasks(page);
  const item = page.getByRole('menuitem', { name, exact: true });
  const trigger = page.getByRole('button', { name: '帳號選單', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(item).toBeVisible();
  return item;
}

export async function openSettings(page: Page) {
  await (await accountAction(page, '設定')).click();
  await expect(page.getByRole('region', { name: '設定頁面', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '管理分類', exact: true }).getByRole('link', { name: '個人設定', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/view=settings/);
}

export async function openNavigation(page: Page) {
  await closeTasks(page);
  const trigger = page.getByRole('button', { name: '開啟導覽', exact: true });
  if (await trigger.isVisible() && await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

export async function navigationAction(page: Page, name: string) {
  await openNavigation(page);
  return page.getByRole('navigation', { name: '主要導覽', exact: true }).getByRole('link', { name, exact: true });
}

export async function chooseStorage(page: Page, name: string) {
  await openNavigation(page);
  await page.getByRole('navigation', { name: '儲存入口', exact: true }).getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('dialog', { name: '工作空間導覽', exact: true })).toHaveCount(0);
}

export async function closeTasks(page: Page) {
  const close = page.getByRole('button', { name: '關閉工作', exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.getByRole('dialog', { name: '工作', exact: true })).toHaveCount(0);
}

export async function openTasks(page: Page) {
  const trigger = page.getByRole('button', { name: '工作', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(page.getByRole('dialog', { name: '工作', exact: true })).toBeVisible();
}

export async function fileAction(page: Page, name: string) {
  const direct = page.getByRole('button', { name, exact: true });
  const general = page.getByRole('button', { name: '更多檔案操作', exact: true });
  const selected = page.getByRole('button', { name: '更多所選操作', exact: true });
  await expect.poll(async () => await direct.isVisible() || await general.isVisible() || await selected.isVisible()).toBe(true);
  if (await direct.isVisible()) return direct;
  const more = await general.isVisible() ? general : selected;
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeVisible();
  return item;
}

export async function enableSelection(page:Page) {
  if(await page.getByRole('checkbox').count())return;
  const mode=await fileAction(page,'選取項目');
  if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();
  const more=page.getByRole('button',{name:'更多檔案操作',exact:true});if(await more.isVisible()&&await more.getAttribute('aria-expanded')==='true')await more.click();
}
export async function selectFile(page:Page,name:string,checked=true) {
  const checkbox=page.getByLabel(`選取 ${name}`,{exact:true});
  if(!await checkbox.isVisible())await enableSelection(page);
  await checkbox.setChecked(checked);
}
export async function chooseView(page:Page,view:'list'|'mosaic'|'thumbnails') {
  const button=await fileAction(page,'切換檢視');
  for(let attempt=0;attempt<3;attempt++){if(await button.getAttribute('data-view')===view){const more=page.getByRole('button',{name:'更多檔案操作',exact:true});if(await more.isVisible()&&await more.getAttribute('aria-expanded')==='true')await more.click();return;}await button.click();}
  await expect(button).toHaveAttribute('data-view',view);
}
