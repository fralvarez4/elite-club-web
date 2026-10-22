import { test, expect } from '@playwright/test'

test('one collapsible panel combines brand, size, color and type and preselects matching variant', async ({ page }) => {
  await page.goto('/catalogo')
  const panel = page.locator('.filter-panel')
  await expect(page.getByRole('combobox', { name: 'Filtrar por marca' })).not.toBeVisible()
  await panel.locator('summary').click()
  expect(await page.getByRole('combobox', { name: 'Filtrar por talle' }).locator('option').evaluateAll(options => options.slice(1).map(option => option.value))).toEqual(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '8', '12', '-'])
  await page.getByRole('combobox', { name: 'Filtrar por marca' }).selectOption('CORTEIZ')
  await page.getByRole('combobox', { name: 'Filtrar por talle' }).selectOption('-')
  await page.getByRole('combobox', { name: 'Filtrar por color' }).selectOption('Blue')
  await page.getByRole('combobox', { name: 'Filtrar por tipo de producto' }).selectOption('Accesorios')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('.product-card').getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: 'Ver resultados' }).click()
  await expect(page.getByRole('combobox', { name: 'Filtrar por color' })).not.toBeVisible()
  await page.locator('.product-card .quick-add').click()
  await page.getByRole('button', { name: 'Carrito 1', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Corteiz Cap Blue' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await panel.locator('summary').click()
  await panel.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
  await expect(page.locator('.results')).toContainText('43 productos')
  await expect(page.locator('.product-card')).toHaveCount(12)
})

test('footer and load-more text share center alignment on mobile and desktop', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/catalogo')
    await expect(page.locator('footer .brand-logo')).toBeVisible()
    for (const [a, b] of [['footer .logo-link', '.footer-identity>span'], ['.load-more .button>span', '.load-more p']]) {
      const first = await page.locator(a).boundingBox()
      const second = await page.locator(b).boundingBox()
      expect(Math.abs(first.x + first.width / 2 - second.x - second.width / 2)).toBeLessThan(1)
    }
    await page.locator('.filter-panel>summary').click()
    await expect(page.getByRole('combobox', { name: 'Filtrar por color' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/filters-${width}.png`, fullPage: true })
  }
})
