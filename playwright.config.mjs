// Purpose: Run real Chromium journeys against an isolated synthetic local server without a frontend build.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:44317",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start.mjs --demo --database :memory: --port 44317",
    url: "http://127.0.0.1:44317",
    reuseExistingServer: false,
    timeout: 15000,
    env: { WORKBENCH_TOKEN: "browser-fixture-operator-token-24-plus" },
  },
});
