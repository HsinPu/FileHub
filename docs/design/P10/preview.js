/* 獨立設計預覽：只有合成資料與暫時 UI 狀態，不讀正式 API、Cookie 或 storage。 */
/* global document, location, URLSearchParams, history, clearTimeout, setTimeout */
const main = document.querySelector('main');
const scenePicker = document.querySelector('#scene');
const sceneNames = [...scenePicker.options].map(option => option.value);
const params = new URLSearchParams(location.search);
const palettePicker = document.querySelector('#palette');
let palette = params.get('palette') === 'p9' ? 'p9' : 'p10';
document.documentElement.dataset.palette = palette;
palettePicker.value = palette;
const requested = params.get('scene');
let scene = sceneNames.includes(requested) ? requested : 'list';
let page = 1;
let filter = '';
const selected = new Set();
const folders = ['design', 'images', 'notes', 'reports', 'source', '長名稱'];
const files = [
  ...folders.map(name => ({ name, folder: true, size: '—', date: '2026/01/01 08:00' })),
  ...Array.from({ length: 60 }, (_, index) => ({ name: `document-${String(index + 1).padStart(2, '0')}.txt`, folder: false, size: index < 9 ? '28 B' : '29 B', date: '2026/01/01 08:00' })),
];
const icon = (name, cls = '') => `<span class="icon ${cls}" aria-hidden="true">${name}</span>`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const symbol = item => icon(item.folder ? 'folder' : 'description', `file-icon${item.folder ? ' folder' : ''}`);
const button = (text, action, style = '', glyph = '') => `<button class="button ${style}" data-action="${action}">${glyph ? icon(glyph) : ''}${text}</button>`;
const heading = (title, count = '', actions = true) => `<div class="workspace-heading"><div><p class="breadcrumbs">${scene === 'settings' ? '工作空間 ' + icon('chevron_right') + ' 設定' : '檔案 ' + icon('chevron_right') + ' 我的檔案'}</p><div class="title-line"><h1>${title}</h1>${count ? `<span class="secondary">${count}</span>` : ''}</div></div>${actions && !selected.size ? `<div class="page-actions">${button('上傳', 'upload', 'primary', 'file_upload')}${button('新建資料夾', 'mkdir', '', 'create_new_folder')}</div>` : ''}</div>`;
const views = mode => `<div class="view-switch" aria-label="檢視方式">${[['list', 'view_list', '詳細列表'], ['mosaic', 'view_module', '圖磚'], ['gallery', 'photo_library', '圖庫']].map(([value, glyph, label]) => `<button class="icon-button ${mode === value ? 'active' : ''}" data-scene="${value}" aria-label="${label}" aria-pressed="${mode === value}">${icon(glyph)}</button>`).join('')}</div>`;
const row = item => `<tr class="${selected.has(item.name) ? 'selected' : ''}"><td><div class="resource">${selected.size ? `<label class="check-area"><input type="checkbox" data-select="${escape(item.name)}" aria-label="選取 ${escape(item.name)}" ${selected.has(item.name) ? 'checked' : ''}></label>` : symbol(item)}<div class="resource-name"><button data-open="${escape(item.name)}">${escape(item.name)}</button><small class="mobile-meta">${item.folder ? '資料夾' : item.size} · 2026/01/01</small></div><button class="icon-button" data-action="resource-more" data-name="${escape(item.name)}" aria-label="項目操作 ${escape(item.name)}">${icon('more_horiz')}</button></div></td><td class="file-size">${item.size}</td><td class="modified">${item.date}</td></tr>`;
function dataset() {
  if (scene === 'long') return [
    { name: '一份具有完整中文說明且需要在小螢幕自然換行的長名稱驗收文件 100%.txt', size: '19 B', date: '2026/01/01 08:00' },
    { name: 'image.png', size: '142 B', date: '2026/01/01 08:00' },
    { name: 'document.pdf', size: '592 B', date: '2026/01/01 08:00' },
  ];
  return files.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()));
}
function renderFiles() {
  const mode = ['mosaic', 'gallery'].includes(scene) ? scene : 'list';
  const data = dataset(), visible = data.slice((page - 1) * 50, page * 50);
  let html = heading(scene === 'long' ? '長名稱' : '版面驗收', `${data.length} 個項目`);
  if (scene === 'partial') html += `<div class="notice">${icon('info_outline')}<div><p><strong>搜尋結果尚不完整</strong></p><p>已達本次掃描上限；請縮小範圍再搜尋。部分目錄未完成檢查。</p></div></div>`;
  html += selected.size ? `<div class="content-tools"><div class="selection-bar"><strong>已選取 ${selected.size} 項</strong>${button('下載', 'download', '', 'file_download')}${button('分享', 'share', '', 'share')}${button('更多', 'more', '', 'more_horiz')}${button('取消選取', 'select', '', 'close')}</div></div>` : `<div class="content-tools"><span class="secondary ${filter ? 'filter-summary' : 'sort-summary'}">${filter ? `名稱包含「${escape(filter)}」` : '依名稱排序'}</span>${button('選取', 'select', 'quiet', 'check_circle_outline')}${views(mode)}<button class="icon-button" data-action="refresh" aria-label="重新整理">${icon('refresh')}</button></div>`;
  if (!visible.length) html += `<section class="empty">${icon('search_off')}<h2>沒有符合的項目</h2><p>請試試其他名稱，或清除篩選。</p>${button('清除篩選', 'clear')}</section>`;
  else if (mode === 'list') html += `<div class="file-surface"><table class="file-table" aria-label="檔案列表"><colgroup><col><col><col></colgroup><thead><tr><th scope="col">名稱 ${icon('arrow_upward')}</th><th scope="col">大小</th><th scope="col">修改時間</th></tr></thead><tbody>${visible.map(row).join('')}</tbody></table></div>`;
  else html += `<div class="tile-grid ${mode === 'gallery' ? 'gallery' : ''}">${visible.map(item => `<article class="tile ${selected.has(item.name) ? 'selected' : ''}">${mode === 'gallery' ? `<div class="tile-image">${symbol(item)}</div>` : symbol(item)}<div class="tile-content resource-name"><button data-open="${escape(item.name)}">${escape(item.name)}</button><p>${item.folder ? '資料夾' : item.size} · 2026/01/01</p></div></article>`).join('')}</div>`;
  html += `<div class="listing-footer"><span>僅顯示此層內容 · 檔案可能由其他程式更新</span><div class="pagination"><span>${data.length ? (page - 1) * 50 + 1 : 0}–${Math.min(page * 50, data.length)} / ${data.length}</span>${data.length > 50 ? [1, 2].map(n => `<button class="icon-button ${page === n ? 'active' : ''}" data-page="${n}" aria-label="第 ${n} 頁">${n}</button>`).join('') : ''}</div></div>`;
  main.innerHTML = html;
}
function renderSettings() {
  main.innerHTML = `<div class="settings">${heading('個人設定', '', false)}<div class="tabs" aria-label="管理分類示意"><span class="active">個人設定</span><span>分享管理</span><span>帳號管理</span><span>儲存與授權</span><span>垃圾桶</span></div><div class="settings-grid"><form class="form-section" data-demo-form><h2>檔案偏好</h2><p class="secondary">設定下次開啟 FileHub 時使用的預設檢視。</p><div class="field"><label for="default-view">預設檢視</label><select id="default-view"><option>詳細列表</option><option>圖磚</option><option>圖庫</option></select></div><div class="field"><label for="page-size">每頁筆數</label><select id="page-size"><option>50</option><option>25</option><option>100</option></select></div><div class="form-footer">${button('儲存偏好', 'save', 'primary')}</div></form><form class="form-section" data-demo-form><h2>修改密碼</h2><p class="secondary">更新後，所有裝置的既有登入都會結束，請使用新密碼重新登入。</p><div class="field"><label for="current-password">目前密碼</label><input id="current-password" type="password" autocomplete="current-password"></div><div class="field"><label for="new-password">新密碼</label><input id="new-password" type="password" autocomplete="new-password"><small>15–128 字元</small></div><div class="form-footer">${button('更新密碼', 'save')}</div></form></div><p class="prototype-note">表單只示範視覺與焦點；不儲存輸入或變更任何帳號。</p></div>`;
}
function renderLogin() {
  main.innerHTML = `<div class="login"><form class="login-card" data-demo-form><span class="brand-mark" aria-hidden="true">F</span><img class="brand-svg" src="assets/filehub-symbol.svg" width="40" height="40" alt=""><h1>登入 FileHub</h1><p class="secondary">登入以瀏覽與管理你的檔案。</p><div class="field"><label for="username">帳號</label><input id="username" autocomplete="username" placeholder="請輸入帳號"></div><div class="field"><label for="password">密碼</label><input id="password" type="password" autocomplete="current-password" placeholder="請輸入密碼"></div>${button('登入', 'login', 'primary')}<p class="prototype-note">設計示意，請勿輸入真實帳密。<br>帳號由管理員建立。</p></form></div>`;
}
function renderPublic() {
  main.innerHTML = `<div class="public-content"><p class="secondary public-intro">有人與你分享了這個檔案</p><section class="file-surface"><div class="public-heading">${icon('description', 'file-icon')}<div><h1>readme.txt</h1><p class="secondary">公開分享 · 檔案</p></div></div><div class="public-body"><dl><dt>大小</dt><dd>15 B</dd><dt>修改時間</dt><dd>2026/01/01 08:00</dd><dt>連結到期</dt><dd>2026/10/31 18:00</dd></dl>${button('下載原檔', 'download', 'primary', 'file_download')}<p class="prototype-note">此頁只提供分享範圍內的瀏覽與原檔下載。</p></div></section><p class="prototype-note">合成檔案；這份預覽不包含分享密鑰或真實下載。</p></div>`;
}

function renderBrand() {
  main.innerHTML = '<section class="brand-review"><h1>FileHub 的配色與向量識別</h1><p>保留熟悉的藍色操作，把檔案與資訊拉回中性灰。暖金只辨認資料夾；錯誤、警告與完成仍使用原本語意色。這是候選設計，尚未套用正式版。</p><div class="brand-board"><figure class="brand-card"><div class="brand-lockup"><img src="assets/filehub-symbol.svg" width="72" height="72" alt="FileHub 資料夾與 F 標誌"><span>FileHub</span></div><figcaption>資料夾輪廓、負形 F、暖金頁籤。純向量，沒有點陣底圖。</figcaption></figure><figure class="brand-card"><div class="brand-lockup"><img src="assets/filehub-symbol-mono.svg" width="72" height="72" alt="FileHub 單色標誌"><span>FileHub</span></div><figcaption>單色版保留同一輪廓與負形，適用黑白列印及單色標示。</figcaption></figure><figure class="brand-card dark"><div class="brand-lockup"><img src="assets/filehub-symbol-reverse.svg" width="72" height="72" alt="FileHub 反白標誌"><span>FileHub</span></div><figcaption>深色背景使用反白版；此處只驗資產，不代表產品新增深色主題。</figcaption></figure></div><h2>實際小尺寸</h2><div class="brand-card logo-sizes">' + [16,24,32,48,128].map(size => '<figure><img src="assets/filehub-symbol.svg" width="'+size+'" height="'+size+'" alt="'+size+' 像素彩色標誌"><figcaption>'+size+' px</figcaption></figure>').join('') + '</div><div class="asset-links"><a href="assets/filehub-symbol.svg" download>下載彩色 SVG</a><a href="assets/filehub-symbol-mono.svg" download>下載單色 SVG</a><a href="assets/filehub-symbol-reverse.svg" download>下載反白 SVG</a></div><h2>色彩的角色</h2><div class="swatch-grid"><div class="swatch"><div class="swatch-paint primary"></div><span>墨藍：操作與焦點</span></div><div class="swatch"><div class="swatch-paint canvas"></div><span>中性淺底：閱讀</span></div><div class="swatch"><div class="swatch-paint folder"></div><span>暖金：資料夾</span></div><div class="swatch"><div class="swatch-paint text"></div><span>深灰：檔案與內容</span></div></div><p class="prototype-note">左上配色選單可以切回 P9 色票作同版面比較。正式 P9 原圖另開；原型沒有接 API，版面不作正式版逐像素還原。</p></section>';
}

function render() {
  document.body.dataset.scene = scene;
  scenePicker.value = scene;
  document.querySelectorAll('.nav-link[data-page]').forEach(link => { const active = link.dataset.page === (scene === 'settings' ? 'settings' : 'files'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const base = scene === 'settings' ? 'personal' : scene === 'public' ? 'public-file' : scene === 'login' ? 'login' : scene === 'empty' ? 'workspace-empty' : scene === 'error' ? 'workspace-error' : scene === 'selected' ? 'selected-list' : ['mosaic', 'gallery'].includes(scene) ? scene : 'list';
  document.querySelector('#baseline').href = `../../validation/P9.8/windows-desktop-${base}.png`;
  if (scene === 'brand') renderBrand();
  else if (scene === 'settings') renderSettings();
  else if (scene === 'login') renderLogin();
  else if (scene === 'public') renderPublic();
  else if (scene === 'empty') main.innerHTML = `${heading('空資料夾', '0 個項目', false)}<section class="empty">${icon('folder_open')}<h2>這個資料夾目前是空的</h2><p>可以上傳檔案，或先建立資料夾來整理內容。</p><div class="page-actions">${button('上傳檔案', 'upload', 'primary', 'file_upload')}${button('新建資料夾', 'mkdir', '', 'create_new_folder')}</div></section><p class="prototype-note">唯讀入口會改為說明文字；不顯示未授權的寫入動作。</p>`;
  else if (scene === 'error') main.innerHTML = `${heading('團隊資料', '', false)}<div class="notice error">${icon('error_outline')}<div><p><strong>目前無法讀取這個入口</strong></p><p>請確認外部資料夾是否可用，再重新整理。問題編號：DEMO-001</p></div></div>${button('重新整理', 'refresh', '', 'refresh')}`;
  else renderFiles();
  document.querySelector('#task-panel').hidden = scene !== 'tasks';
  document.querySelector('#tasks-trigger').setAttribute('aria-expanded', String(scene === 'tasks'));
  document.querySelector('#task-count').hidden = scene !== 'tasks';
}
function navigate(next) {
  scene = next; page = 1; filter = ''; selected.clear();
  if (next === 'selected') { selected.add('design'); selected.add('document-01.txt'); }
  document.querySelector('#search').value = '';
  history.replaceState(null, '', `?scene=${encodeURIComponent(next)}&palette=${palette}`);
  render();
}
const feedback = message => { const node = document.querySelector('#feedback'); node.textContent = message; node.hidden = false; clearTimeout(feedback.timer); feedback.timer = setTimeout(() => { node.hidden = true; }, 4500); };
const showDialog = (title, body) => { document.querySelector('#dialog-title').textContent = title; document.querySelector('#dialog-body').innerHTML = body; document.querySelector('#preview-dialog').showModal(); };
main.addEventListener('submit', event => { event.preventDefault(); feedback('設計示意：沒有儲存輸入或提交資料。'); });
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action],[data-scene],[data-page],[data-open],[data-select]');
  if (!target || !main.contains(target)) return;
  if (target.dataset.scene) { navigate(target.dataset.scene); return; }
  if (target.dataset.page) { page = Number(target.dataset.page); renderFiles(); main.focus(); return; }
  if (target.dataset.select) { const name = target.dataset.select; if (selected.has(name)) selected.delete(name); else selected.add(name); renderFiles(); const next = [...main.querySelectorAll('[data-select]')].find(node => node.dataset.select === name); (next ?? main.querySelector('[data-action="select"]'))?.focus(); return; }
  if (target.dataset.open) { showDialog(target.dataset.open, '<p>這是檔案開啟樣式示意。正式版會沿用既有目錄瀏覽與安全預覽；本提案沒有讀取檔案內容。</p>'); return; }
  const action = target.dataset.action;
  if (action === 'upload') showDialog('上傳檔案', `<div class="dialog-example">${icon('file_upload')}<p>選擇檔案或資料夾</p></div><p class="prototype-note">設計預覽不會開啟檔案選擇器或送出上傳。正式版沿用既有上傳協定、限制與佇列。</p>`);
  else if (action === 'mkdir') showDialog('新建資料夾', '<div class="field"><label for="folder-name">資料夾名稱</label><input id="folder-name" placeholder="請輸入名稱"></div><p class="prototype-note">只示範表單與焦點；不建立實際資料夾。</p>');
  else if (action === 'select') { if (selected.size) selected.clear(); else selected.add('design'); renderFiles(); main.querySelector('[data-action="select"]')?.focus(); }
  else if (action === 'clear') { filter = ''; document.querySelector('#search').value = ''; renderFiles(); }
  else if (action === 'resource-more') showDialog('項目操作', `<p><strong>${escape(target.dataset.name)}</strong></p><p class="prototype-note">正式版在此提供依目前權限可用的預覽、下載、分享及檔案動作；此預覽只呈現按鈕位置。</p>`);
  else if (action === 'more') showDialog('項目操作', '<p>正式版沿用複製、剪下、打包、改名及回收的權限與確認流程。此處僅示範情境工具列。</p>');
  else feedback('設計示意：沒有送出請求或變更正式資料。');
});
scenePicker.addEventListener('change', () => navigate(scenePicker.value));
document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); filter = document.querySelector('#search').value.trim(); page = 1; scene = 'list'; render(); });
document.querySelector('#account').addEventListener('click', () => navigate('settings'));
document.querySelector('#tasks-trigger').addEventListener('click', event => { const panel = document.querySelector('#task-panel'); panel.hidden = !panel.hidden; event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) panel.focus(); });
document.querySelector('#close-tasks').addEventListener('click', () => { document.querySelector('#task-panel').hidden = true; document.querySelector('#tasks-trigger').setAttribute('aria-expanded', 'false'); document.querySelector('#tasks-trigger').focus(); });
document.querySelector('#open-navigation').addEventListener('click', () => document.querySelector('#navigation-dialog').showModal());
document.querySelector('#task-panel').addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('#close-tasks').click(); });
if (scene === 'selected') { selected.add('design'); selected.add('document-01.txt'); }
render();

palettePicker.addEventListener('change', () => {
  palette = palettePicker.value === 'p9' ? 'p9' : 'p10';
  document.documentElement.dataset.palette = palette;
  history.replaceState(null, '', '?scene=' + encodeURIComponent(scene) + '&palette=' + palette);
});
