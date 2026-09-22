// Give each spec a fresh database, files and login limiter through Playwright's webServer.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = require.resolve("@playwright/test/cli");
const selected = process.argv.slice(2);
const available = (await readdir(resolve(root, "tests"))).filter(file => file.endsWith(".spec.ts")).sort();
if (selected.some(file => !available.includes(file))) throw new Error("Specify existing spec basenames only");
const files = selected.length ? selected : available;
const runRoot = resolve(root, "test-results", "isolated-" + Date.now());
await mkdir(runRoot, { recursive: true });
const results = [];
const summary = resolve(root, "test-results", "isolated-summary.json");
await writeFile(summary, JSON.stringify({ status: "running", runRoot, results }, null, 2));
for (const file of files) {
  const output = resolve(runRoot, file.replace(".spec.ts", ""));
  const report = resolve(output, "report.json");
  console.log("\nIsolated browser verification: " + file);
  // Playwright filters are regular expressions; anchor the basename so
  // settings.spec.ts cannot also select personal-settings.spec.ts.
  const pattern = "(^|[/\\\\])" + file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
  const child = spawnSync(process.execPath, [cli, "test", pattern, "--reporter=line,json", "--output=" + output], {
    cwd: root, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
  });
  let stats = null;
  try { stats = JSON.parse(await readFile(report, "utf8")).stats; } catch { /* Failed before reporting. */ }
  results.push({ file, exitCode: child.status ?? 1, stats });
  await writeFile(summary, JSON.stringify({ status: "running", runRoot, results }, null, 2));
  if (child.error || child.signal) break;
}
const failed = results.some(result => result.exitCode !== 0) || results.length !== files.length;
await writeFile(summary, JSON.stringify({ status: failed ? "failed" : "passed", runRoot, results }, null, 2));
console.log("\nBrowser specs: " + results.length + "; failures: " + results.filter(result => result.exitCode !== 0).length);
process.exitCode = failed ? 1 : 0;
