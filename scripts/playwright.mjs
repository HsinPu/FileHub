import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

// 必須在載入 Playwright registry 之前設定，install／test 使用相同的隔離位置。
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../.tools/playwright-browsers/', import.meta.url));
// Runner 會再啟動 Node workers，移除互斥色彩設定，保留真實程式警告。
delete process.env.NO_COLOR;
process.env.FORCE_COLOR = '0';
await import('@playwright/test/cli');
