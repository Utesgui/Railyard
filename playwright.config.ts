import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The remote sandbox ships a pinned Chromium; use it when present instead of downloading one.
const sandboxChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions,
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
