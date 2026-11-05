import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.ts', outputDir: './test-results/e2e',
  fullyParallel: false, workers: 1, forbidOnly: true, retries: 0,
  // 整批包含三視窗；每份隔離 CLI／KDF 約 15–25 秒，預留 75 分鐘。單 case／expect／retry 不變。
  timeout: 30_000, globalTimeout: 4_500_000, expect: { timeout: 8000 }, reporter: 'list',
  use: {
    browserName: 'chromium', headless: true, locale: 'zh-TW', timezoneId: 'Asia/Taipei',
    colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', testIgnore: '**/visual-accessibility.spec.ts', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'chromium-tablet', testIgnore: '**/visual-accessibility.spec.ts', use: { viewport: { width: 800, height: 1024 } } },
    { name: 'chromium-mobile', testIgnore: '**/visual-accessibility.spec.ts', use: { viewport: { width: 390, height: 844 } } },
    { name: 'chromium-accessibility', testMatch: '**/visual-accessibility.spec.ts', use: { viewport: { width: 1280, height: 960 } } },
  ],
});
