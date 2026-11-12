import { test, expect } from '@playwright/test'
import { publicAppUrl, buildPreference, checkoutInput, createCheckout, checkoutFailure } from '../src/lib/checkout.js'

const id = '11111111-1111-4111-8111-111111111111'
const owner = '22222222-2222-4222-8222-222222222222'
const order = () => ({ id, user_id: owner, status: 'pending', pricing_version: 'usd_mep_v1', subtotal: '0.30', shipping_cost: 0, order_delivery: { method: 'shipping' }, total: '0.30', order_items: [{ product_id: 'a', quantity: 3, unit_price: '0.10', products: { name: 'Remera Elite', price: 9999 } }] })
const request = (body = { order_id: id }, headers = {}) => new Request('http://localhost:3000/api/v1/checkout', { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const claimToken = '33333333-3333-4333-8333-333333333333'
const preferenceClient = (state = { state: 'claimed', claim_token: claimToken }) => ({
  calls: [],
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() } }) }) }) }),
  async rpc(name, args) {
    this.calls.push({ name, args })
    if (name === 'elite_claim_checkout_preference') return { data: state }
    if (name === 'elite_finish_checkout_preference') return { data: { state: 'ready', preference_id: args.p_preference_id, init_point: args.p_init_point } }
    if (name === 'elite_release_checkout_preference') return { data: true }
    if (name === 'elite_record_payment') return { data: 'approved' }
    throw new Error('Unexpected RPC')
  },
})
function client(data, userId = owner) {
  const filters = []
  const query = { select: columns => { expect(columns).not.toContain('products(price)'); return query }, eq: (key, value) => { filters.push([key, value]); return query }, maybeSingle: async () => ({ data }) }
  return { filters, rpc: async (name, args) => { expect(name).toBe('elite_checkout_quota'); expect(args).toEqual({ p_order_id: id }); return { data: { allowed: true } } }, auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) }, from: table => { expect(table).toBe('orders'); return query } }
}

test('stored subtotal and shipping must balance, pickup is free and legacy delivery is rejected', () => {
  for (const changes of [{ subtotal: '0.31' }, { shipping_cost: '1' }, { order_delivery: null }, { shipping_cost: -1 }]) {
    expect(() => buildPreference({ ...order(), ...changes }, owner, 'https://8.8.8.8')).toThrow()
  }
  const paidShipping = { ...order(), shipping_cost: '5.50', total: '5.80' }
  expect(buildPreference(paidShipping, owner, 'https://8.8.8.8').items[1]).toMatchObject({ quantity: 1, unit_price: 5.5 })
  expect(() => buildPreference({ ...paidShipping, order_delivery: { method: 'pickup' } }, owner, 'https://8.8.8.8')).toThrow()
})

test('APP_URL requires a public HTTPS origin including DNS addresses', async () => {
  const resolve = async () => [{ address: '8.8.8.8' }]
  expect(await publicAppUrl('https://shop.example.org', resolve)).toBe('https://shop.example.org')
  for (const value of [undefined, '', 'bad', 'http://example.org', 'https:example.org', 'https://localhost', 'https://localhost.', 'https://foo.local', 'https://127.1', 'https://0x7f000001', 'https://10.1.2.3', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[2001::]', 'https://user:secret@example.org', 'https://example.org/path', 'https://example.org/?x=1', 'https://example.org/#hash']) {
    await expect(publicAppUrl(value, resolve)).rejects.toMatchObject({ status: 503 })
  }
  for (const addresses of [[], [{ address: '192.168.1.1' }], [{ address: '8.8.8.8' }, { address: '::1' }]]) await expect(publicAppUrl('https://shop.example.org', async () => addresses)).rejects.toMatchObject({ status: 503 })
  await expect(publicAppUrl('https://shop.example.org', async () => { throw new Error('DNS') })).rejects.toMatchObject({ status: 503 })
})

test('Zod accepts only order_id UUID, limits the body and checks origin', async () => {
  expect(await checkoutInput(request())).toEqual({ order_id: id })
  for (const body of [{}, { order_id: 'bad' }, { order_id: id, unit_price: 1 }, { order_id: id, user_id: owner }, { order_id: id, status: 'pending' }, [], null, '{']) await expect(checkoutInput(request(body))).rejects.toMatchObject({ status: 400 })
  await expect(checkoutInput(request(' '.repeat(1025)))).rejects.toMatchObject({ status: 413 })
  await expect(checkoutInput(request(undefined, { Origin: 'https://evil.test' }))).rejects.toMatchObject({ status: 403 })
})

test('preference uses historic prices and exact cents, rejects other owners and invalid orders', () => {
  const result = buildPreference(order(), owner, 'https://shop.example.org')
  expect(result).toMatchObject({ external_reference: id, auto_return: 'approved', items: [{ id: 'a', title: 'Remera Elite', quantity: 3, unit_price: 0.1, currency_id: 'ARS' }] })
  for (const outcome of ['success', 'pending', 'failure']) expect(result.back_urls[outcome]).toBe(`https://shop.example.org/?checkout=${outcome}&order_id=${id}`)
  expect(() => buildPreference(order(), 'admin', 'https://shop.example.org')).toThrow('Pedido no encontrado')
  expect(() => buildPreference({ ...order(), pricing_version: 'legacy_ars' }, owner, 'https://shop.example.org')).toThrow('pedido anterior')
  for (const status of ['approved', 'rejected', 'cancelled']) expect(() => buildPreference({ ...order(), status }, owner, 'https://shop.example.org')).toThrow()
  for (const total of ['0.31', NaN, Infinity, -1, 0.30000000000000004]) expect(() => buildPreference({ ...order(), total }, owner, 'https://shop.example.org')).toThrow()
  expect(() => buildPreference({ ...order(), order_items: [] }, owner, 'https://shop.example.org')).toThrow()
  for (const unit_price of [null, 0, -1, 'NaN', 'Infinity', '0.001']) expect(() => buildPreference({ ...order(), order_items: [{ ...order().order_items[0], unit_price }] }, owner, 'https://shop.example.org')).toThrow()
})

test('checkout validates before contacting Mercado Pago and never returns raw provider secrets', async () => {
  const calls = []
  const token = 'fake-server-secret'
  const recordingClient = preferenceClient()
  const options = { appUrl: 'https://8.8.8.8', token, preferenceClient: recordingClient, fetch: async (url, init) => {
    calls.push({ url, init })
    return Response.json({ id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1', access_token: token })
  } }
  const supabase = client(order())
  const result = await createCheckout(request(), supabase, options)
  expect(supabase.filters).toEqual([['id', id], ['user_id', owner]])
  expect(result).toEqual({ preference_id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1' })
  expect(calls).toHaveLength(1)
  expect(recordingClient.calls.map(call => call.name)).toEqual(['elite_claim_checkout_preference', 'elite_finish_checkout_preference'])
  expect(calls[0].url).toBe('https://api.mercadopago.com/checkout/preferences')
  expect(calls[0].init.headers.Authorization).toBe(`Bearer ${token}`)
  expect(JSON.parse(calls[0].init.body).items[0].unit_price).toBe(0.1)
  for (const appUrl of [undefined, '', 'http://localhost:3000', 'https://127.0.0.1']) await expect(createCheckout(request(), client(order()), { ...options, appUrl })).rejects.toMatchObject({ status: 503 })
  await expect(createCheckout(request(), client(order()), { ...options, token: '' })).rejects.toMatchObject({ status: 503 })
  await expect(createCheckout(request(), client(order(), null), options)).rejects.toMatchObject({ status: 401 })
  await expect(createCheckout(request(), client(order(), 'admin'), options)).rejects.toMatchObject({ status: 404 })
  await expect(createCheckout(request(), client({ ...order(), total: 1 }), options)).rejects.toMatchObject({ status: 409 })
  expect(calls).toHaveLength(1)
  for (const send of [async () => Response.json({ error: token }, { status: 401 }), async () => { throw new Error(token) }, async () => Response.json({ id: 'x', init_point: 'https://evil.test' })]) {
    try { await createCheckout(request(), client(order()), { ...options, fetch: send }); throw new Error('Expected failure') } catch (error) {
      expect(error.status).toBe(502)
      const response = checkoutFailure(error)
      expect(await response.text()).not.toContain(token)
    }
  }
})

test('saved preference is reused; uncertain creation blocks a second provider call', async () => {
  const destination = { preference_id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1' }
  let providerCalls = 0
  const options = { appUrl: 'https://8.8.8.8', token: 'fixture', collectorId: '1234', fetch: async url => { if (url.includes('/payments/search?')) return Response.json({ paging: { total: 0 }, results: [] }); providerCalls++; throw new Error('Network timeout') } }
  expect(await createCheckout(request(), client(order()), { ...options, preferenceClient: preferenceClient({ state: 'ready', ...destination }) })).toEqual(destination)
  await expect(createCheckout(request(), client(order()), { ...options, preferenceClient: preferenceClient({ state: 'creating' }) })).rejects.toMatchObject({ status: 409 })
  const pending = preferenceClient()
  await expect(createCheckout(request(), client(order()), { ...options, preferenceClient: pending })).rejects.toMatchObject({ status: 502 })
  expect(providerCalls).toBe(1)
  expect(pending.calls.map(call => call.name)).toEqual(['elite_claim_checkout_preference'])
  const timeout = preferenceClient()
  await expect(createCheckout(request(), client(order()), { ...options, preferenceClient: timeout, fetch: async () => Response.json({}, { status: 408 }) })).rejects.toMatchObject({ status: 502 })
  expect(timeout.calls.map(call => call.name)).toEqual(['elite_claim_checkout_preference'])
  const rejected = preferenceClient()
  await expect(createCheckout(request(), client(order()), { ...options, preferenceClient: rejected, fetch: async () => Response.json({}, { status: 400 }) })).rejects.toMatchObject({ status: 502 })
  expect(rejected.calls.map(call => call.name)).toEqual(['elite_claim_checkout_preference', 'elite_release_checkout_preference'])
})

test('a paid preference is reconciled and never reopened; uncertain provider results fail closed', async () => {
  const destination = { state: 'ready', preference_id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1' }
  const saved = preferenceClient(destination)
  const payment = { id: 4567, external_reference: id, collector_id: 1234, currency_id: 'ARS', transaction_amount: 0.3, status: 'approved' }
  const options = { appUrl: 'https://8.8.8.8', token: 'fixture', collectorId: '1234', preferenceClient: saved, fetch: async url =>
    url.includes('/payments/search?') ? Response.json({ paging: { total: 1 }, results: [{ id: 4567 }] }) : Response.json(payment) }
  await expect(createCheckout(request(), client(order()), options)).rejects.toMatchObject({ status: 409 })
  expect(saved.calls.map(call => call.name)).toEqual(['elite_claim_checkout_preference', 'elite_record_payment'])
  expect(saved.calls[1].args.p_payment_id).toBe('4567')
  await expect(createCheckout(request(), client(order()), { ...options, fetch: async () => { throw new Error('MP unavailable') } })).rejects.toMatchObject({ status: 503 })
  await expect(createCheckout(request(), client(order()), { ...options, fetch: async () => Response.json({ paging: { total: 2 }, results: [{ id: 4567 }] }) })).rejects.toMatchObject({ status: 503 })
  payment.status = 'pending'
  await expect(createCheckout(request(), client(order()), options)).rejects.toMatchObject({ status: 409 })
})
