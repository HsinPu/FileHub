import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const metadata: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string') throw new Error('缺少 FileHub build 版本。');
const version = metadata.version;
const notices = readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'filehub-attributions',
    generateBundle() { this.emitFile({ type: 'asset', fileName: `assets/licenses/NOTICE-${version}.txt`, source: notices }); },
  }],
  define: { __FILEHUB_VERSION__: JSON.stringify(metadata.version) },
  build: { outDir: 'build', emptyOutDir: true, target: 'es2022', sourcemap: false },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/health': 'http://127.0.0.1:3000', '/api': 'http://127.0.0.1:3000' } },
});
