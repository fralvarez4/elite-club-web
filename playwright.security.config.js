import { defineConfig } from '@playwright/test'

// Servidor aislado: no reutilizar la sesión de desarrollo ni sus artefactos.
// Ejecutar build antes o después de esta suite, nunca simultáneamente.
export default defineConfig({
  testDir: './tests', workers: 2, timeout: 60000,
  use: { baseURL: 'http://localhost:3200', headless: true, channel: 'msedge' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --port 3200',
    url: 'http://localhost:3200', reuseExistingServer: false, timeout: 120000,
    env: { ELITE_TEST_DIST_DIR: '.next/security-tests', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'fixture-site-key' },
  },
})
