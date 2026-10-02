import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests', use: { baseURL: 'http://localhost:3000', headless: true, channel: 'msedge' }, webServer: { command: 'npm run dev -- --hostname 127.0.0.1', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120000 } })
