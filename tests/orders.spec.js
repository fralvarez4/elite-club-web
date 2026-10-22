import { test, expect } from '@playwright/test'
import { validateOrderItems, orderInput, orderPagination, validateOrderId, requireOrderUser } from '../src/lib/orders.js'

test('order API payload only accepts product IDs and bounded integer quantities', async () => {
  const valid = { items: [{ product_id: 'elite-2', quantity: 2 }] }
  expect(validateOrderItems(valid)).toEqual(valid.items)
  for (const payload of [null, [], { ...valid, total: 1 }, { ...valid, status: 'approved' }, { ...valid, user_id: 'another' }, { items: [] },
    { items: [{ ...valid.items[0], unit_price: 1 }] }, { items: [valid.items[0], valid.items[0]] },
    ...[0, -1, 1.1, 100, '1', NaN, Infinity].map(quantity => ({ items: [{ product_id: 'elite-2', quantity }] }))]) {
    expect(() => validateOrderItems(payload)).toThrow()
  }
  const request = (body, headers = {}) => new Request('http://localhost:3000/api/v1/orders', { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...headers }, body })
  const complete = { ...valid, delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' } }
  await expect(orderInput(request(JSON.stringify(complete)))).resolves.toEqual(complete)
  await expect(orderInput(request(JSON.stringify(valid)))).rejects.toMatchObject({ status: 400 })
  for (const injected of [{ total: 0 }, { subtotal: 0 }, { shipping_cost: 0 }, { pickup_address: 'Falsa' }, { status: 'approved' }]) {
    await expect(orderInput(request(JSON.stringify({ ...complete, delivery: { ...complete.delivery, ...injected } })))).rejects.toMatchObject({ status: 400 })
  }
  await expect(orderInput(request(JSON.stringify(valid), { Origin: 'https://evil.test' }))).rejects.toMatchObject({ status: 403 })
  await expect(orderInput(request(JSON.stringify(valid), { 'Content-Type': 'text/plain' }))).rejects.toMatchObject({ status: 415 })
  await expect(orderInput(request('{'))).rejects.toMatchObject({ status: 400 })
  await expect(orderInput(request(' '.repeat(16385)))).rejects.toMatchObject({ status: 413 })
})

test('pagination and UUID are bounded; authentication uses verified Auth user', async () => {
  expect(orderPagination('http://local.test/')).toEqual({ limit: 20, offset: 0 })
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=10001', 'limit=1&limit=2', 'user_id=other']) expect(() => orderPagination(`http://local.test/?${query}`)).toThrow()
  expect(() => validateOrderId('not-a-uuid')).toThrow()
  expect(() => validateOrderId('11111111-1111-4111-8111-111111111111')).not.toThrow()
  await expect(requireOrderUser({ auth: { getUser: async () => ({ data: { user: null } }) } })).rejects.toMatchObject({ status: 401 })
  await expect(requireOrderUser({ auth: { getUser: async () => ({ data: { user: { id: 'verified' } } }) } })).resolves.toEqual({ id: 'verified' })
})

test('all order endpoints require authentication', async ({ request }) => {
  for (const path of ['/api/v1/orders', '/api/v1/orders/11111111-1111-4111-8111-111111111111']) {
    expect((await request.get(path)).status()).toBe(401)
  }
  expect((await request.post('/api/v1/orders', { data: { items: [] } })).status()).toBe(401)
})
