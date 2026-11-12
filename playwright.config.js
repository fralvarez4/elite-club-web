import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', timeout: 60000,
  use: { baseURL: 'http://localhost:3000', headless: true, channel: 'msedge' },
  webServer: [
    { command: 'node tests/fixtures/supabase-catalog.mjs', url: 'http://127.0.0.1:3999/rest/v1/products', reuseExistingServer: true },
    { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120000,
      env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'fixture-site-key', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3999', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture' } },
  ],
})
