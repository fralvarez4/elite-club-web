import { test, expect } from '@playwright/test'

test('customer can reopen an older order and see its current status', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111'
  const order = { id, user_id: '22222222-2222-4222-8222-222222222222', status: 'approved', total: '63132.00', created_at: '2026-11-11T23:55:00Z', order_delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Pérez', phone: '1123456789', pickup_name: 'Elite Club', pickup_address: 'Artigas 1046' } }
  await page.route('**/api/v1/orders?*', route => route.fulfill({ json: { orders: [order], limit: 10, offset: 0, has_more: false } }))
  await page.route(`**/api/v1/orders/${id}`, route => route.fulfill({ json: { order: { ...order, order_items: [{ id: 'item-1', product_id: 'nocta-cap', quantity: 1, unit_price: '63132.00', products: { name: 'Nocta Cap White', size: '-' } }] } } }))
  await page.goto('/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByText('Aprobado')).toBeVisible()
  await page.getByRole('button', { name: /Ver detalle del pedido/ }).click()
  await expect(page.locator('.order-card').first().getByRole('heading', { name: /Detalle/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Ver detalle del pedido/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Nocta Cap White × 1')).toBeVisible()
  await expect(page.getByText('Artigas 1046')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar pago' })).toHaveCount(0)
})

test('pending order resumes its checkout without creating another order', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111'
  const order = { id, status: 'pending', total: '100.00', created_at: '2026-11-11T23:55:00Z' }
  const requests = []
  await page.route('**/api/v1/orders?*', route => route.fulfill({ json: { orders: [order], has_more: false } }))
  await page.route(`**/api/v1/orders/${id}`, route => route.fulfill({ json: { order } }))
  await page.route('**/api/v1/checkout', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { preference_id: 'existing', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=existing' } })
  })
  await page.route('https://www.mercadopago.com.ar/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Pago de prueba</p>' }))
  await page.goto('/pedidos')
  await page.getByRole('button', { name: 'Continuar pago' }).click()
  await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout/)
  expect(requests).toEqual([{ order_id: id }])
})

test('changed status blocks payment before calling checkout', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111'
  const order = { id, status: 'pending', total: '100.00', created_at: '2026-11-11T23:55:00Z' }
  let checkoutCalls = 0
  await page.route('**/api/v1/orders?*', route => route.fulfill({ json: { orders: [order], has_more: false } }))
  await page.route(`**/api/v1/orders/${id}`, route => route.fulfill({ json: { order: { ...order, status: 'approved' } } }))
  await page.route('**/api/v1/checkout', route => { checkoutCalls++; return route.fulfill({ status: 500, json: {} }) })
  await page.goto('/pedidos')
  await page.getByRole('button', { name: 'Continuar pago' }).click()
  await expect(page.locator('.orders-page .auth-message[role="alert"]')).toContainText('El estado del pedido cambió')
  expect(checkoutCalls).toBe(0)
})

test('history pagination reaches older orders', async ({ page }) => {
  const base = { user_id: '22222222-2222-4222-8222-222222222222', status: 'pending', total: '100.00', created_at: '2026-11-11T23:55:00Z', order_delivery: { method: 'pickup' } }
  await page.route('**/api/v1/orders?*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    const orders = offset ? [{ ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] : Array.from({ length: 10 }, (_, index) => ({ ...base, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}` }))
    return route.fulfill({ json: { orders, limit: 10, offset, has_more: !offset } })
  })
  await page.goto('/pedidos')
  await expect(page.locator('.order-card')).toHaveCount(10)
  await page.getByRole('button', { name: 'Siguientes' }).click()
  await expect(page.getByText('Página 2')).toBeVisible()
  await expect(page.locator('.order-card')).toHaveCount(1)
  await expect(page.getByText('Pedido #AAAAAAAA')).toBeVisible()
})

test('details open inside the selected card, including on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const orders = [0, 1, 2].map(index => ({ id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, status: 'rejected', total: '100.00', created_at: '2026-11-11T23:55:00Z' }))
  await page.route('**/api/v1/orders?*', route => route.fulfill({ json: { orders, has_more: false } }))
  await page.route('**/api/v1/orders/*', route => {
    const id = route.request().url().split('/').at(-1)
    return route.fulfill({ json: { order: { ...orders.find(order => order.id === id), order_items: [] } } })
  })
  await page.goto('/pedidos')
  const cards = page.locator('.order-card')
  await cards.nth(1).getByRole('button', { name: /Ver detalle del pedido/ }).click()
  await expect(cards.nth(1).locator('.order-detail')).toBeVisible()
  await expect(cards.nth(0).locator('.order-detail')).toHaveCount(0)
  await expect(cards.nth(2).locator('.order-detail')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continuar pago' })).toHaveCount(0)
})
