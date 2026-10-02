import { test, expect } from '@playwright/test'

test('adding from product detail confirms in place and persists', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ver Nocta Cap', exact: true }).click()
  const detail = page.getByRole('dialog')
  await detail.getByRole('button', { name: 'Agregar al carrito', exact: true }).click()
  await expect(detail.getByRole('status')).toHaveText('Agregado al carrito · 1 unidad')
  await expect(detail.getByRole('heading', { name: 'Nocta Cap' })).toBeVisible()
  await detail.getByRole('button', { name: 'Agregar al carrito', exact: true }).click()
  await expect(detail.getByRole('status')).toHaveText('Agregado al carrito · 2 unidades')
  await page.screenshot({ path: 'test-results/detail-confirmation.png' })
  await detail.getByRole('button', { name: 'Ver carrito (2)', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tu carrito (2)' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Carrito 2', exact: true })).toBeVisible()
})

for (const width of [390, 768, 1440]) {
  test(`three columns and unclipped brands at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.locator('.product-card')).toHaveCount(12)
    const columns = await page.locator('.product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(3)
    const corteiz = page.locator('.brand-strip').getByRole('link', { name: 'CORTEIZ', exact: true })
    await corteiz.scrollIntoViewIfNeeded()
    const box = await corteiz.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await page.locator('.brand-strip').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(page.getByText('Acerca de esta tienda')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.product-card').last().scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('.product-card img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0))).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `test-results/redesign-${width}.png`, fullPage: true })
  })
}
