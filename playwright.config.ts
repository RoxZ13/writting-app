import { defineConfig, devices } from '@playwright/test'

// End-to-end checks run against the production build (service worker included), not the dev server.
// E2E_PORT lets parallel runs use their own server; E2E_NO_BUILD reuses the dist/ that is already built.
const PORT = Number(process.env.E2E_PORT ?? 4175)
// E2E_DIST builds into and serves from its own folder, so parallel runs never overwrite each other's build.
const DIST = process.env.E2E_DIST
const outDir = DIST ? ` --outDir ${DIST}` : ''
const build = process.env.E2E_NO_BUILD ? '' : DIST ? `npx tsc -b && npx vite build${outDir} && ` : 'npm run build && '

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // WebKit, the engine of Safari: the closest to an iPhone without one. Not a substitute for real Safari.
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `${build}npm run preview -- --port ${PORT} --strictPort${outDir}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
