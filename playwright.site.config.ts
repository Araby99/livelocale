import { defineConfig, devices } from '@playwright/test';

// The landing site's E2E suite. It builds the site for the GitHub Pages project path and serves
// it under /livelocale/, so any root-relative URL fails here as it would on Pages.
const SITE_URL = 'http://localhost:4173/livelocale/';

export default defineConfig({
  testDir: 'tests/site',
  testIgnore: 'media/**',
  reporter: 'list',
  use: {
    baseURL: SITE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@touch/,
    },
    {
      name: 'touch',
      use: { ...devices['Pixel 7'], hasTouch: true, isMobile: true },
      grep: /@touch/,
    },
    // The tests a rendering engine can break (video decoding and playback, the door tabs, the
    // offline search) run again in WebKit and Firefox.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@cross/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      grep: /@cross/,
    },
  ],
  webServer: {
    command: 'npm run site:build && node tests/site/fixtures/serve.mjs site/dist 4173 /livelocale/',
    url: SITE_URL,
    env: { SITE_URL },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
