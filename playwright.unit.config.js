import { defineConfig } from '@playwright/test'

// Pruebas de módulos y PostgreSQL embebido, sin levantar Next ni navegador.
export default defineConfig({ testDir: './tests', workers: 2, timeout: 60000 })
