import { test, expect } from '@playwright/test'

test('five featured garments cycle in both directions and open their matching detail', async ({ page }) => {
  await page.goto('/')
  const hero = page.locator('.campaign')
  const names = new Set()
  const firstImage = await hero.locator('.is-active img').getAttribute('src')
  for (let i = 1; i <= 5; i++) {
    names.add(await hero.locator('.is-active img').getAttribute('src'))
    await hero.getByRole('button', { name: 'Producto siguiente' }).click()
  }
  expect(names.size).toBe(5)
  await expect(hero.locator('.is-active img')).toHaveAttribute('src', firstImage)
  await hero.getByRole('button', { name: 'Producto anterior' }).click()
  await expect(hero.locator('.is-active img')).not.toHaveAttribute('src', firstImage)
  await expect(hero.locator('.carousel-position')).toHaveCount(0)
  const name = await hero.locator('.is-active img').getAttribute('alt')
  await hero.locator('.featured-product.is-active').click()
  await expect(page.getByRole('dialog').getByRole('heading', { name, exact: true })).toBeVisible()
})

test('warm storefront keeps original garment colors and a loaded PNG logo', async ({ page }) => {
  await page.goto('/catalogo')
  await expect(page.locator('.header .brand-logo')).toBeVisible()
  await expect(page.locator('.header .brand-logo')).toHaveAttribute('src', '/elite-club-logo.png')
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(250, 247, 246)')
  expect(await page.locator('.photo-button img').first().evaluate(el => getComputedStyle(el).mixBlendMode)).toBe('normal')
  await expect(page.getByRole('button', { name: 'Productos', exact: true })).toHaveCount(0)
  await expect(page.locator('.nav-trigger')).toHaveText(['Hombre', 'Mujer'])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.product-card').last().scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('.product-card img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/warm-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'test-results/warm-desktop.png', fullPage: true })
})
