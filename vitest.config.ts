import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@filehub/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@filehub/server': fileURLToPath(new URL('./apps/server/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Docker --cpus=2 仍回報 8 個可用核心；限制 suite workers，保留案例內真正跨程序並行。
    maxWorkers: 2,
    testTimeout: 10_000,
    projects: [
      { test: { name: 'toolchain', include: ['apps/server/tests/integration/toolchain.test.ts'] } },
      { test: { name: 'unit', include: ['apps/server/tests/unit/**/*.test.ts', 'apps/web/tests/unit/**/*.test.ts'] } },
      { test: { name: 'integration', include: ['apps/server/tests/integration/**/*.test.ts'], exclude: ['**/toolchain.test.ts'] } },
      { test: { name: 'http', include: ['tests/http/**/*.test.ts'], fileParallelism: false } },
      { test: { name: 'system', include: ['tests/system/**/*.test.ts'], exclude: ['tests/system/compose*.test.ts'], fileParallelism: false, testTimeout: 20_000 } },
      { test: { name: 'compose', include: ['tests/system/compose*.test.ts'], fileParallelism: false, testTimeout: 180_000, hookTimeout: 60_000 } },
      { test: { name: 'release', include: ['tests/release/**/*.test.ts'], fileParallelism: false, testTimeout: 180_000, hookTimeout: 60_000 } },
    ],
  },
});
