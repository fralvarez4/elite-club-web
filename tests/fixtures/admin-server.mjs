// Backend ficticio local para verificar rutas Next reales, sin credenciales ni base remota.
import { createServer } from 'node:http'

const users = Object.fromEntries(['user', 'admin', 'other'].map((role, index) => [role, {
  id: `${index + 1}1111111-1111-4111-8111-111111111111`, aud: 'authenticated', role: 'authenticated',
  email: `${role}@example.test`, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
}]))
const sessions = Object.fromEntries(Object.entries(users).map(([role, user]) => {
  const now = Math.floor(Date.now() / 1000)
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url')
  return [role, { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: now + 3600 })}.fixture-${role}`, refresh_token: `refresh-${role}`, expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user }]
}))
const deliveryOptions = [{ method: 'shipping', cost: 0 }, { method: 'pickup', cost: 0, pickup_name: 'Punto de retiro Elite Club', pickup_address: 'General Jose Gervasio Artigas 1046', pickup_hours: '10:00 a 20:00', pickup_contact: '1161406462' }]
let adminRole = 'admin'
let products = []
let orders = []
let preferences = []
let checkoutPreferences = new Map()
let exchangeRate = null
let limited = false
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3101')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3100')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('X-Supabase-Api-Version', '2024-01-01')
  const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)) }
  if (req.method === 'OPTIONS') return send({})
  let text = ''
  for await (const chunk of req) text += chunk
  const body = text ? JSON.parse(text) : {}
  if (url.pathname === '/fixtures/reset') { adminRole = 'admin'; products = []; orders = []; preferences = []; checkoutPreferences = new Map(); exchangeRate = null; limited = false; return send({}) }
  if (url.pathname === '/fixtures/rate-limit') { limited = body.enabled === true; return send({}) }
  if (url.pathname === '/fixtures/mercadopago') {
    preferences.push(body)
    return send({ id: `pref-${preferences.length}`, init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-${preferences.length}` }, 201)
  }
  if (url.pathname === '/fixtures/preferences') return send(preferences)
  if (url.pathname === '/fixtures/order-change') {
    Object.assign(orders.find(order => order.id === body.id), body.changes)
    return send({})
  }
  if (url.pathname === '/fixtures/revoke') { adminRole = 'user'; return send({}) }
  if (url.pathname.startsWith('/fixtures/session/')) return send(sessions[url.pathname.split('/').pop()])
  const role = Object.keys(sessions).find(role => req.headers.authorization === `Bearer ${sessions[role].access_token}`)
  if (url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'pkce' && body.auth_code === 'valid-code' && body.code_verifier === 'fixture-verifier') return send(sessions.admin)
    return send({ code: 'invalid_grant', message: 'Invalid code' }, 400)
  }
  if (url.pathname === '/auth/v1/user') return role ? send(users[role]) : send({ message: 'Invalid JWT' }, 401)
  if (url.pathname === '/rest/v1/profiles') {
    if (!role || url.searchParams.get('user_id') !== `eq.${users[role].id}`) return send(null)
    return send({ id: role === 'admin' ? '2' : '1', user_id: users[role].id, first_name: 'Test', last_name: 'User', birth_date: '2000-01-01',
      phone: role === 'user' ? '1112345678' : null, street: role === 'user' ? 'San Martin' : null,
      street_number: role === 'user' ? '123' : null, postal_code: role === 'user' ? '1000' : null,
      city: role === 'user' ? 'CABA' : null, province: role === 'user' ? 'CABA' : null,
      role: role === 'admin' ? adminRole : 'user' })
  }
  if (url.pathname === '/rest/v1/delivery_options') return send(deliveryOptions)
  if (url.pathname === '/rest/v1/rpc/elite_store_mep_rate') {
    if (req.headers.authorization !== 'Bearer fixture-service-key') return send({ code: '42501' }, 403)
    exchangeRate = { rate: body.p_rate, updated_at: body.p_updated_at, fetched_at: body.p_fetched_at }
    return send(true)
  }
  if (url.pathname.startsWith('/rest/v1/rpc/elite_') && url.pathname.endsWith('_checkout_preference')) {
    if (req.headers.authorization !== 'Bearer fixture-service-key') return send({ code: '42501' }, 403)
    const order = orders.find(item => item.id === body.p_order_id && item.user_id === body.p_user_id)
    if (!order) return send({ code: 'PT404' }, 404)
    const existing = checkoutPreferences.get(body.p_order_id)
    if (url.pathname.endsWith('/elite_claim_checkout_preference')) {
      if (order.status !== 'pending') return send({ code: 'PT409' }, 409)
      if (existing?.preference_id) return send({ state: 'ready', preference_id: existing.preference_id, init_point: existing.init_point })
      if (existing) return send({ state: 'creating' })
      const claim_token = crypto.randomUUID()
      checkoutPreferences.set(body.p_order_id, { claim_token })
      return send({ state: 'claimed', claim_token })
    }
    if (!existing || existing.claim_token !== body.p_claim_token) return send({ code: 'PT409' }, 409)
    if (url.pathname.endsWith('/elite_finish_checkout_preference')) {
      if (existing.preference_id) return send({ code: 'PT409' }, 409)
      Object.assign(existing, { preference_id: body.p_preference_id, init_point: body.p_init_point })
      return send({ state: 'ready', preference_id: existing.preference_id, init_point: existing.init_point })
    }
    if (url.pathname.endsWith('/elite_release_checkout_preference')) {
      if (existing.preference_id) return send(false)
      checkoutPreferences.delete(body.p_order_id)
      return send(true)
    }
  }
  // Contrato HTTP simulado. Las cuotas/privilegios reales se prueban con PGlite.
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    if (!role) return send({ code: 'PT401' }, 401)
    if (limited) {
      res.setHeader('Retry-After', '42')
      return send({ code: 'PT429', message: 'private detail must not escape', details: '{"retry_after":42}' }, 429)
    }
  }
  if (url.pathname === '/rest/v1/rpc/elite_consume_read_quota') return send({ allowed: true })
  if (url.pathname === '/rest/v1/rpc/elite_checkout_quota') {
    const order = orders.find(order => order.id === body.p_order_id && order.user_id === users[role].id)
    if (!order) return send({ code: 'PT404' }, 404)
    return order.status === 'pending' ? send({ allowed: true }) : send({ code: 'PT409' }, 409)
  }
  if (url.pathname.startsWith('/rest/v1/rpc/elite_admin_')) {
    if (role !== 'admin' || adminRole !== 'admin') return send({ code: 'PT403' }, 403)
    if (url.pathname.endsWith('elite_admin_create_product')) {
      const product = { id: crypto.randomUUID(), ...body.p_product }
      products.push(product)
      return send(product)
    }
    const index = products.findIndex(product => product.id === body.p_id)
    if (index < 0) return send({ code: 'PT404' }, 404)
    if (url.pathname.endsWith('elite_admin_update_product')) {
      products[index] = { ...products[index], ...body.p_product }
      return send(products[index])
    }
    if (url.pathname.endsWith('elite_admin_delete_product')) return send({ deleted: products.splice(index, 1)[0].id })
  }
  if (url.pathname === '/rest/v1/rpc/elite_create_order') {
    if (!role) return send({ code: 'PT401' }, 401)
    const orderId = crypto.randomUUID()
    if (!exchangeRate) return send({ code: 'PT503' }, 503)
    const items = body.p_items.map(item => {
      const unit_price_usd = products.find(product => product.id === item.product_id)?.price
      return { id: crypto.randomUUID(), order_id: orderId, ...item, unit_price_usd,
        unit_price: Math.round(unit_price_usd * exchangeRate.rate * 100) / 100 }
    })
    if (items.some(item => !item.unit_price)) return send({ code: 'PT400', message: 'Producto inexistente' }, 400)
    const order = { id: orderId, user_id: users[role].id, status: 'pending', total: items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
      pricing_version: 'usd_mep_v1', fx_rate: exchangeRate.rate, fx_source: 'dolarapi_mep_venta', fx_date: exchangeRate.updated_at,
      fx_fetched_at: exchangeRate.fetched_at, created_at: new Date().toISOString(), order_items: items }
    if (!body.p_delivery) return send({ code: 'PT400' }, 400)
    order.subtotal = order.total; order.shipping_cost = 0
    order.order_delivery = { ...deliveryOptions.find(o => o.method === body.p_delivery.method), ...body.p_delivery, order_id: orderId }
    orders.push(order)
    return send(order)
  }
  if (url.pathname === '/rest/v1/orders') {
    if (!role) return send({ code: '42501' }, 403)
    let visible = orders.filter(order => role === 'admin' && adminRole === 'admin' || order.user_id === users[role].id)
    if (url.searchParams.has('user_id')) visible = visible.filter(order => `eq.${order.user_id}` === url.searchParams.get('user_id'))
    if (url.searchParams.has('id')) {
      const order = visible.find(order => `eq.${order.id}` === url.searchParams.get('id'))
      if (!order) return send(null)
      if (url.searchParams.get('select')?.includes('products(')) return send({ ...order, order_items: order.order_items.map(item => ({ ...item, products: products.find(product => product.id === item.product_id) || null })) })
      return send(order)
    }
    visible.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 100)
    return send(visible.slice(offset, offset + limit))
  }
  if (url.pathname === '/rest/v1/products') {
    if (req.method === 'GET') return send(products)
    return send({ code: '42501', message: 'Direct writes denied' }, 403)
  }
  return send({ message: 'Unknown fixture route' }, 404)
})
server.listen(3101, '127.0.0.1')
