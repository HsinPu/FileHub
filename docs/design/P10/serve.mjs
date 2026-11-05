/* global URL, console, process */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const allowed = new Map([
  ...['preview.html', 'preview.css', 'preview.js'].map(file => [`/docs/design/P10/${file}`, `docs/design/P10/${file}`]),
  ...['filehub-symbol.svg', 'filehub-symbol-mono.svg', 'filehub-symbol-reverse.svg'].map(file => [`/docs/design/P10/assets/${file}`, `docs/design/P10/assets/${file}`]),
  ...['material-icons-filled.woff2', 'roboto-normal-latin.woff2', 'roboto-medium-latin.woff2', 'roboto-bold-latin.woff2'].map(file => [`/apps/web/src/assets/fonts/${file}`, `apps/web/src/assets/fonts/${file}`]),
  ...['list', 'mosaic', 'gallery', 'selected-list', 'workspace-empty', 'workspace-error', 'personal', 'login', 'public-file'].map(file => [`/docs/validation/P9.8/windows-desktop-${file}.png`, `docs/validation/P9.8/windows-desktop-${file}.png`]),
]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

/** 只服務本提案、既有授權字體及明列的合成參考圖；不公開儲存庫或使用者檔案。 */
export async function startPreview() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.writeHead(302, { Location: '/docs/design/P10/preview.html' }); res.end(); return; }
      const relative = allowed.get(url.pathname);
      if (!relative || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
      const data = await fs.readFile(path.join(root, relative));
      res.writeHead(200, { 'Content-Type': mime[path.extname(relative)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'" });
      res.end(data);
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/docs/design/P10/preview.html` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startPreview();
  console.log(url);
}
