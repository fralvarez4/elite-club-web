import { test, expect } from '@playwright/test'

const backend = 'http://127.0.0.1:3101'
const origin = 'http://localhost:3100'
async function authenticate(context, request, role, forged = false) {
  const session = await (await request.get(`${backend}/fixtures/session/${role}`)).json()
  if (forged) { session.user.user_metadata.role = 'admin'; session.user.id = '21111111-1111-4111-8111-111111111111' }
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: origin, sameSite: 'Lax' }])
}
test.beforeEach(async ({ request }) => { await request.post(`${backend}/fixtures/reset`) })

test('real APIs return safe 429 with Retry-After and never call MP when quota is blocked', async ({ context, request }) => {
  await authenticate(context, request, 'admin')
  const api = context.request
  const data = { name: 'Prueba', size: 'M', brand: 'Elite', type: 'Remera', image: '/products/test.webp', sort_order: 5, price: 10 }
  const product = await (await api.post('/api/admin/products', { headers: { origin }, data })).json()
  const orderBody = { items: [{ product_id: product.id, quantity: 1 }], delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '1123456789' } }
  const { order } = await (await api.post('/api/v1/orders', { headers: { origin }, data: orderBody })).json()
  await request.post(`${backend}/fixtures/rate-limit`, { data: { enabled: true } })
  for (const [method, path, body] of [
    ['get', '/api/admin/products'], ['post', '/api/admin/products', data],
    ['patch', `/api/admin/products/${product.id}`, data], ['delete', `/api/admin/products/${product.id}`],
    ['get', '/api/v1/orders'], ['get', `/api/v1/orders/${order.id}`],
    ['post', '/api/v1/orders', orderBody], ['post', '/api/v1/checkout', { order_id: order.id }],
  ]) {
    const response = await api[method](path, { headers: { origin }, ...(body ? { data: body } : {}) })
    expect(response.status(), path).toBe(429)
    expect(response.headers()['retry-after']).toBe('42')
    expect(await response.text()).not.toContain('private detail')
  }
  expect(await (await request.get(`${backend}/fixtures/preferences`)).json()).toEqual([])
})

test('real routes deny users even when cookie user/role are forged', async ({ page, context, request }) => {
  await authenticate(context, request, 'user', true)
  expect((await page.goto('/admin')).status()).toBe(403)
  for (const [method, path] of [['get', ''], ['post', ''], ['patch', '/one'], ['delete', '/one']]) {
    expect((await context.request[method](`/api/admin/products${path}`, { headers: { origin }, data: {} })).status()).toBe(403)
  }
})

test('admin CRUD succeeds, validates inputs and reacts immediately to revocation', async ({ page, context, request }) => {
  await authenticate(context, request, 'admin')
  expect((await page.goto('/admin')).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
  const data = { name: 'Prueba', size: 'M', brand: 'Elite', type: 'Remera', image: '/products/test.webp', sort_order: 5, price: 12500.5 }
  const api = context.request
  expect((await api.post('/api/admin/products', { headers: { origin: 'https://other.test' }, data })).status()).toBe(403)
  expect((await api.post('/api/admin/products', { headers: { origin }, data: { ...data, role: 'admin' } })).status()).toBe(400)
  const created = await api.post('/api/admin/products', { headers: { origin }, data })
  expect(created.status()).toBe(201)
  const { id } = await created.json()
  for (const price of [undefined, null, 0, -1, '100']) {
    expect((await api.post('/api/admin/products', { headers: { origin }, data: { ...data, price } })).status()).toBe(400)
    expect((await api.patch(`/api/admin/products/${id}`, { headers: { origin }, data: { ...data, price } })).status()).toBe(400)
  }
  expect((await api.patch(`/api/admin/products/${id}`, { headers: { origin }, data: { ...data, name: 'Editada' } })).status()).toBe(200)
  expect(await (await api.get('/api/admin/products')).json()).toEqual([expect.objectContaining({ id, name: 'Editada', sort_order: 5 })])
  expect((await api.delete(`/api/admin/products/${id}`, { headers: { origin } })).status()).toBe(200)
  expect((await api.patch('/api/admin/products/missing', { headers: { origin }, data })).status()).toBe(404)
  await request.post(`${backend}/fixtures/revoke`)
  expect((await api.get('/api/admin/products')).status()).toBe(403)
  expect((await api.post('/api/admin/products', { headers: { origin }, data })).status()).toBe(403)
  expect((await page.goto('/admin')).status()).toBe(403)
})

test('admin price is required, editable and displayed from Supabase in cards and detail', async ({ page, context, request }) => {
  await authenticate(context, request, 'admin')
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click()
  const price = page.getByLabel('Precio (USD)', { exact: true })
  await expect(price).toHaveValue('')
  expect(await price.evaluate(input => input.required && !input.checkValidity())).toBe(true)
  await page.getByLabel('Nombre', { exact: true }).fill('Elite Tee Black')
  await page.getByLabel('Talle', { exact: true }).fill('M')
  await page.getByLabel('Marca', { exact: true }).fill('Elite')
  await page.getByLabel('Tipo', { exact: true }).fill('REMERA')
  // Se utiliza una ruta de producto válida; la foto ausente usa el placeholder existente.
  await page.getByLabel('Imagen (ruta o URL HTTPS)', { exact: true }).fill('/products/test.webp')
  await price.fill('0')
  expect(await price.evaluate(input => input.checkValidity())).toBe(false)
  await price.fill('12500.5')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Producto guardado.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(price).toHaveValue('12500.5')
  await price.fill('15999.75')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Editar producto' })).toHaveCount(0)
  const stored = await (await context.request.get('/api/admin/products')).json()
  expect(stored[0].price).toBe(15999.75)
  await context.request.post('/api/admin/products', { headers: { origin }, data: {
    name: 'Elite Tee Black', size: 'L', brand: 'Elite', type: 'REMERA', image: '/products/test.webp', sort_order: 1, price: 18000,
  } })
  await page.goto('/')
  const card = page.locator('.product-card').first()
  const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })
  await expect(card.locator('.product-price')).toHaveText(formatter.formatRange(15999.75, 18000))
  await card.getByRole('button', { name: 'Black', exact: true }).click()
  await card.getByRole('button', { name: 'Talle M', exact: true }).click()
  await expect(card.locator('.product-price')).toHaveText(formatter.format(15999.75))
  await card.locator('.product-title').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.product-price')).toHaveText(formatter.format(15999.75))
  await dialog.locator('.size-picker summary').click()
  await dialog.getByRole('button', { name: 'Talle L', exact: true }).click()
  await expect(dialog.locator('.product-price')).toHaveText(formatter.format(18000))
})

test('PKCE callback exchanges code server-side, sets cookies and rejects bad codes', async ({ context, request }) => {
  await context.addCookies([{ name: 'sb-127-auth-token-code-verifier', value: `base64-${Buffer.from(JSON.stringify('fixture-verifier')).toString('base64url')}`, url: origin, sameSite: 'Lax' }])
  const response = await context.request.get('/auth/callback?flow=oauth&code=valid-code', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers().location).toBe(`${origin}/?auth=oauth`)
  expect((await context.cookies()).some(cookie => cookie.name === 'sb-127-auth-token')).toBe(true)
  expect((await context.request.get('/api/admin/products')).status()).toBe(200)
  const failed = await request.get('/auth/callback?flow=confirm&code=bad&next=https://evil.test', { maxRedirects: 0 })
  expect(failed.headers().location).toBe(`${origin}/?auth=confirm&auth_error=callback`)
})
