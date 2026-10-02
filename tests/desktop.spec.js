import { test, expect } from '@playwright/test'
test('desktop catalog renders without browser errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.hero-product')).toBeVisible()
  await expect.poll(() => page.locator('.hero-product').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true })
  expect(errors).toEqual([])
})
