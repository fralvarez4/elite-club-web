import { test, expect } from '@playwright/test'

const backend = 'http://127.0.0.1:3101'
const origin = 'http://localhost:3100'
const endpoint = '/api/v1/orders'
async function login(context, role, forged = false) {
  const session = await (await context.request.get(`${backend}/fixtures/session/${role}`)).json()
  if (forged) { session.user.id = '21111111-1111-4111-8111-111111111111'; session.user.user_metadata.role = 'admin' }
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: origin, sameSite: 'Lax' }])
}
test.beforeEach(async ({ context, request }) => {
  await request.post(`${backend}/fixtures/reset`)
  await login(context, 'admin')
})
async function seedProduct(context) {
  const response = await context.request.post('/api/admin/products', { headers: { origin }, data: { name: 'Prueba', size: 'M', brand: 'Elite', type: 'REMERA', image: '/products/test.webp', sort_order: 0, price: 25.5 } })
  expect(response.status()).toBe(201)
  return (await response.json()).id
}
const post = (context, data, headers = {}) => context.request.post(endpoint, { headers: { origin, ...headers }, data: typeof data === 'object' ? { delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' }, ...data } : data })

test('create/list/detail preserve ownership and admins can read all; forged cookies cannot grant access', async ({ context }) => {
  const product_id = await seedProduct(context)
  await login(context, 'user')
  const created = await post(context, { items: [{ product_id, quantity: 2 }] })
  expect(created.status()).toBe(201)
  expect(created.headers()['cache-control']).toContain('no-store')
  const { order: first } = await created.json()
  expect(first).toMatchObject({ user_id: '11111111-1111-4111-8111-111111111111', status: 'pending', total: 51000, fx_rate: 1000 })
  expect(first.order_items[0]).toMatchObject({ product_id, quantity: 2, unit_price: 25500, unit_price_usd: 25.5 })
  expect(created.headers().location).toBe(`${endpoint}/${first.id}`)
  expect((await context.request.get(`${endpoint}/${first.id}`)).status()).toBe(200)
  await login(context, 'other')
  const { order: second } = await (await post(context, { items: [{ product_id, quantity: 1 }] })).json()
  expect((await context.request.get(`${endpoint}/${first.id}`)).status()).toBe(404)
  expect((await (await context.request.get(endpoint)).json()).orders.map(order => order.id)).toEqual([second.id])
  await login(context, 'user', true)
  expect((await context.request.get(`${endpoint}/${second.id}`)).status()).toBe(404)
  await login(context, 'admin')
  const page = await (await context.request.get(`${endpoint}?limit=1`)).json()
  expect(page.orders).toHaveLength(1)
  expect(page.has_more).toBe(true)
  expect((await (await context.request.get(`${endpoint}?limit=1&offset=1`)).json()).orders).toHaveLength(1)
  expect((await context.request.get(`${endpoint}/${first.id}`)).status()).toBe(200)
  await context.request.post(`${backend}/fixtures/revoke`)
  expect((await context.request.get(`${endpoint}/${first.id}`)).status()).toBe(404)
})

test('HTTP validation rejects injected money/identity, invalid items, CSRF and unauthenticated requests', async ({ context }) => {
  const product_id = await seedProduct(context)
  const valid = { items: [{ product_id, quantity: 1 }] }
  for (const body of [{ ...valid, total: 1 }, { ...valid, status: 'approved' }, { ...valid, user_id: 'other' }, { items: [{ product_id, quantity: 1, unit_price: 1 }] }, { items: [] }, { items: [{ product_id: 'missing', quantity: 1 }] }]) {
    expect((await post(context, body)).status()).toBe(400)
  }
  expect((await post(context, valid, { origin: 'https://evil.test' })).status()).toBe(403)
  expect((await post(context, JSON.stringify(valid), { 'Content-Type': 'text/plain' })).status()).toBe(415)
  expect((await post(context, '{', { 'Content-Type': 'application/json' })).status()).toBe(400)
  expect((await post(context, ' '.repeat(16385), { 'Content-Type': 'application/json' })).status()).toBe(413)
  expect((await context.request.get(`${endpoint}?limit=101`)).status()).toBe(400)
  expect((await context.request.get(`${endpoint}/invalid`)).status()).toBe(400)
  expect((await (await context.request.get(endpoint)).json()).orders).toHaveLength(0)
  await context.clearCookies()
  expect((await post(context, valid)).status()).toBe(401)
  expect((await context.request.get(endpoint)).status()).toBe(401)
  expect((await context.request.get(`${endpoint}/11111111-1111-4111-8111-111111111111`)).status()).toBe(401)
})
