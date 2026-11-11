import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: ['admin.integration.js', 'orders.integration.js', 'checkout.integration.js'], workers: 1,
  use: { baseURL: 'http://localhost:3100', headless: true, channel: 'msedge' },
  webServer: [
    { command: 'node tests/fixtures/admin-server.mjs', url: 'http://127.0.0.1:3101/fixtures/reset', reuseExistingServer: true },
    { command: 'node node_modules/next/dist/bin/next dev --port 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 120000,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3101', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture', ELITE_TEST_DIST_DIR: '.next/admin-integration', APP_URL: 'https://8.8.8.8', MERCADOPAGO_ACCESS_TOKEN: 'fixture-mp-token', MERCADOPAGO_WEBHOOK_SECRET: 'fixture-webhook-secret', MERCADOPAGO_COLLECTOR_ID: '1234', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', NODE_OPTIONS: '--import ./tests/fixtures/checkout-fetch.mjs' } },
  ],
})
