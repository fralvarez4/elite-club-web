import { test, expect } from '@playwright/test'

const backend = 'http://127.0.0.1:3101'
const origin = 'http://localhost:3100'
async function login(context, role) {
  const session = await (await context.request.get(`${backend}/fixtures/session/${role}`)).json()
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: origin, sameSite: 'Lax' }])
}
const checkout = (context, data) => context.request.post('/api/v1/checkout', { headers: { origin }, data })

for (const method of ['shipping', 'pickup']) test(`delivery UI ${method}: review creates nothing, payment retries reuse order and cart survives`, async ({ page, context }) => {
  await context.request.post(`${backend}/fixtures/reset`)
  await login(context, 'admin')
  const { id } = await (await context.request.post('/api/admin/products', { headers: { origin }, data: { name: 'Prenda prueba', size: 'M', brand: 'Elite', type: 'REMERA', image: '/products/test.webp', sort_order: 0, price: 100 } })).json()
  await login(context, 'user')
  await page.addInitScript(id => localStorage.setItem('elite-club-v2:11111111-1111-4111-8111-111111111111', JSON.stringify({ cart: [{ id, quantity: 1 }], favorites: [] })), id)
  await page.goto('/catalogo')
  await page.getByRole('button', { name: 'Carrito 1', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('radio', { name: method === 'pickup' ? 'Retiro gratis' : 'Envío gratis a domicilio', exact: true }).check()
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('1112345678')
  if (method === 'shipping') await expect(page.getByLabel('Calle', { exact: true })).toHaveValue('San Martin')
  await page.getByLabel('Nombre', { exact: true }).fill('123')
  await page.getByLabel('Teléfono', { exact: true }).fill('abc')
  await page.getByRole('button', { name: 'Revisar pedido' }).click()
  await expect(page.getByText('Revisá los campos señalados antes de continuar.')).toBeVisible()
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  expect((await (await context.request.get('/api/v1/orders')).json()).orders).toHaveLength(0)
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido', { exact: true }).fill('Perez')
  await page.getByLabel('Teléfono', { exact: true }).fill('123456789')
  if (method === 'shipping') {
    for (const [label, value] of [['Calle', 'San Martin'], ['Número', '123'], ['Código postal', '1000'], ['Ciudad', 'CABA'], ['Provincia', 'CABA']]) await page.getByLabel(label, { exact: true }).fill(value)
  } else {
    await expect(page.getByText('General Jose Gervasio Artigas 1046')).toBeVisible()
    await expect(page.getByLabel('Calle', { exact: true })).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Revisar pedido' }).click()
  await expect(page.getByRole('heading', { name: 'Revisión del pedido' })).toBeVisible()
  expect((await (await context.request.get('/api/v1/orders')).json()).orders).toHaveLength(0)
  await page.getByRole('button', { name: 'Cotizar pedido en ARS' }).click()
  await expect(page.getByText('Total a pagar (ARS)')).toBeVisible()
  await expect(page.locator('.account-details strong')).toContainText('100.000,00')
  let attempts = 0
  const orderIds = []
  await page.route('**/api/v1/checkout', async route => {
    attempts++; orderIds.push(route.request().postDataJSON().order_id)
    await route.fulfill({ status: 502, json: { error: 'Proveedor temporalmente no disponible' } })
  })
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Proveedor temporalmente')
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click()
  await expect.poll(() => attempts).toBe(2)
  expect(orderIds[0]).toBe(orderIds[1])
  const orders = (await (await context.request.get('/api/v1/orders')).json()).orders
  expect(orders).toHaveLength(1)
  expect(orders[0]).toMatchObject({ subtotal: 100000, shipping_cost: 0, total: 100000, fx_rate: 1000, order_delivery: { method } })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('elite-club-v2:11111111-1111-4111-8111-111111111111')).cart)).toEqual([{ id, quantity: 1 }])
  await page.unroute('**/api/v1/checkout')
  await page.route('**/api/v1/checkout', route => route.fulfill({ json: { init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test' } }))
  await page.route('https://www.mercadopago.com.ar/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Checkout de prueba</p>' }))
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click()
  await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout/)
})
test('only owner can checkout; historical amounts and pending status are preserved', async ({ context }) => {
  const api = context.request
  await api.post(`${backend}/fixtures/reset`)
  await login(context, 'admin')
  const product = { name: 'Prenda Elite', size: 'M', brand: 'Elite', type: 'REMERA', image: '/products/test.webp', sort_order: 0, price: 10.5 }
  const { id: product_id } = await (await api.post('/api/admin/products', { headers: { origin }, data: product })).json()
  await login(context, 'user')
  const { order } = await (await api.post('/api/v1/orders', { headers: { origin }, data: { items: [{ product_id, quantity: 2 }], delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '1123456789' } } })).json()
  await login(context, 'admin')
  expect((await api.get(`/api/v1/orders/${order.id}`)).status()).toBe(200)
  expect((await checkout(context, { order_id: order.id })).status()).toBe(404)
  await api.patch(`/api/admin/products/${product_id}`, { headers: { origin }, data: { ...product, price: 9999 } })
  await login(context, 'other')
  expect((await checkout(context, { order_id: order.id })).status()).toBe(404)
  await context.clearCookies()
  expect((await checkout(context, { order_id: order.id })).status()).toBe(401)
  await login(context, 'user')
  expect((await checkout(context, { order_id: order.id, unit_price: 1 })).status()).toBe(400)
  expect((await checkout(context, { order_id: 'invalid' })).status()).toBe(400)
  expect(await (await api.get(`${backend}/fixtures/preferences`)).json()).toHaveLength(0)
  const result = await checkout(context, { order_id: order.id })
  expect(result.status()).toBe(201)
  expect(result.headers()['cache-control']).toContain('no-store')
  const response = await result.json()
  expect(Object.keys(response).sort()).toEqual(['init_point', 'preference_id'])
  expect(JSON.stringify(response)).not.toContain('fixture-mp-token')
  const retry = await checkout(context, { order_id: order.id })
  expect(retry.status()).toBe(201)
  expect(await retry.json()).toEqual(response)
  expect(await (await api.get(`${backend}/fixtures/preferences`)).json()).toHaveLength(1)
  const sent = (await (await api.get(`${backend}/fixtures/preferences`)).json())[0]
  expect(sent).toMatchObject({ external_reference: order.id, auto_return: 'approved', items: [{ title: 'Prenda Elite', quantity: 2, unit_price: 10500, currency_id: 'ARS' }] })
  for (const state of ['success', 'pending', 'failure']) expect(sent.back_urls[state]).toBe(`https://8.8.8.8/?checkout=${state}&order_id=${order.id}`)
  const persistedOrder = (await (await api.get(`/api/v1/orders/${order.id}`)).json()).order
  expect(persistedOrder).toMatchObject(order)
  expect(persistedOrder.order_items[0].products).toMatchObject({ id: product_id, name: 'Prenda Elite' })
  await api.post(`${backend}/fixtures/order-change`, { data: { id: order.id, changes: { pricing_version: 'legacy_ars' } } })
  expect((await checkout(context, { order_id: order.id })).status()).toBe(409)
  await api.post(`${backend}/fixtures/order-change`, { data: { id: order.id, changes: { pricing_version: 'usd_mep_v1' } } })
  for (const status of ['approved', 'cancelled', 'rejected']) {
    await api.post(`${backend}/fixtures/order-change`, { data: { id: order.id, changes: { status } } })
    expect((await checkout(context, { order_id: order.id })).status()).toBe(409)
  }
  await api.post(`${backend}/fixtures/order-change`, { data: { id: order.id, changes: { status: 'pending', total: 1 } } })
  expect((await checkout(context, { order_id: order.id })).status()).toBe(409)
  expect(await (await api.get(`${backend}/fixtures/preferences`)).json()).toHaveLength(1)
})
