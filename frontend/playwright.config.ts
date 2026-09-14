import { defineConfig } from "@playwright/test";
const port = Number(process.env.E2E_PORT || 18005);
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.platform === "win32"
        ? "..\\.venv\\Scripts\\python.exe -m backend.tests.serve_e2e"
        : "../.venv/bin/python -m backend.tests.serve_e2e",
    cwd: ".",
    env: { PYTHONPATH: "..", E2E_PORT: String(port) },
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
