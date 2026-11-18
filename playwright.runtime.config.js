import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const localBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/brave-browser') ? '/usr/bin/brave-browser' : undefined);

export default defineConfig({
  testDir: './workers/documents',
  testMatch: 'runtime-browser.spec.js',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], launchOptions: localBrowser ? { executablePath: localBrowser } : {} }
});
