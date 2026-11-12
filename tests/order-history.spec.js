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
  await expect(page.getByRole('heading', { name: /Detalle/ })).toBeVisible()
  await expect(page.getByText('Nocta Cap White × 1')).toBeVisible()
  await expect(page.getByText('Artigas 1046')).toBeVisible()
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
