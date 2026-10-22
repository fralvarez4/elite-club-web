import { readJsonBody } from './requestBody.js'
// Módulo de servidor: utiliza DNS/Node y nunca debe importarse desde la interfaz.
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { z } from 'zod'
import { requireOrderUser, OrderError } from './orders.js'
import { protectedRpc, rateLimitResponse } from './rateLimit.js'

const bodySchema = z.object({ order_id: z.string().uuid() }).strict()
const endpoint = 'https://api.mercadopago.com/checkout/preferences'
const columns = 'id,user_id,status,subtotal,shipping_cost,total,order_delivery(method),order_items(id,product_id,quantity,unit_price,products(name))'
const reserved = new BlockList()
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) reserved.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) reserved.addSubnet(address, prefix, 'ipv6')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
export class CheckoutError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function publicAddress(address) {
  if (isIP(address) === 4) return !reserved.check(address, 'ipv4')
  return isIP(address) === 6 && globalV6.check(address, 'ipv6') && !reserved.check(address, 'ipv6')
}

export async function publicAppUrl(value, resolve = lookup) {
  const invalid = () => new CheckoutError(503, 'APP_URL debe ser una URL pública HTTPS válida, sin credenciales, ruta, query ni fragmento.')
  let url
  try { url = new URL(value) } catch { throw invalid() }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim()) || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !host.includes('.') && !isIP(host) || /(^|\.)(localhost|local|internal|lan|test|invalid|example|onion)$/.test(host) || host.endsWith('.home.arpa')) throw invalid()
  if (isIP(host)) {
    if (!publicAddress(host)) throw invalid()
  } else {
    let timer
    try {
      const addresses = await Promise.race([
        resolve(host, { all: true, verbatim: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(invalid()), 3000) }),
      ])
      if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw invalid()
    } catch { throw invalid() } finally { clearTimeout(timer) }
  }
  return url.origin
}

function cents(value) {
  if (!['number', 'string'].includes(typeof value) || !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(String(value))) throw new CheckoutError(409, 'El pedido contiene importes inválidos.')
  const [whole, fraction = ''] = String(value).split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function buildPreference(order, userId, appUrl) {
  // Defensa adicional aunque RLS permita a un admin leer pedidos ajenos.
  if (!order || order.user_id !== userId) throw new CheckoutError(404, 'Pedido no encontrado.')
  if (order.status !== 'pending') throw new CheckoutError(409, 'Solo se puede iniciar Checkout para un pedido pending.')
  if (!Array.isArray(order.order_items) || !order.order_items.length) throw new CheckoutError(409, 'El pedido no tiene ítems.')
  let total = 0n
  const items = order.order_items.map(item => {
    const price = cents(item.unit_price)
    if (price <= 0n || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || typeof item.products?.name !== 'string' || !item.products.name.trim()) throw new CheckoutError(409, 'El pedido contiene ítems inválidos.')
    total += price * BigInt(item.quantity)
    return { id: item.product_id, title: item.products.name.trim(), quantity: item.quantity, unit_price: Number(price) / 100, currency_id: 'ARS' }
  })
  const shipping = cents(order.shipping_cost)
  if (cents(order.subtotal) !== total || cents(order.total) !== total + shipping) throw new CheckoutError(409, 'El subtotal o total del pedido no coincide con sus ítems y envío.')
  if (!['shipping', 'pickup'].includes(order.order_delivery?.method)) throw new CheckoutError(409, 'El pedido no tiene datos de entrega. Creá un nuevo pedido.')
  if (order.order_delivery.method === 'pickup' && shipping !== 0n) throw new CheckoutError(409, 'El retiro debe ser gratuito.')
  if (shipping > 0n) items.push({ id: 'shipping', title: 'Envío a domicilio', quantity: 1, unit_price: Number(shipping) / 100, currency_id: 'ARS' })
  const back_urls = Object.fromEntries(['success', 'pending', 'failure'].map(result => {
    const url = new URL('/', appUrl)
    url.searchParams.set('checkout', result)
    url.searchParams.set('order_id', order.id)
    return [result, url.href]
  }))
  return { external_reference: order.id, items, back_urls, auto_return: 'approved' }
}

export async function checkoutInput(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new CheckoutError(403, 'Origen no permitido.')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CheckoutError(415, 'Se requiere JSON.')
  const body = await readJsonBody(request, CheckoutError, 1024)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw new CheckoutError(400, 'Enviá únicamente order_id como UUID válido.')
  return parsed.data
}

export async function createCheckout(request, client, { appUrl, token, fetch: send = globalThis.fetch, resolve = lookup }) {
  const user = await requireOrderUser(client)
  const { order_id } = await checkoutInput(request)
  const { data: order, error } = await client.from('orders').select(columns).eq('id', order_id).eq('user_id', user.id).maybeSingle()
  if (error) throw new CheckoutError(503, 'No se pudo consultar el pedido.')
  if (!order || order.user_id !== user.id) throw new CheckoutError(404, 'Pedido no encontrado.')
  const origin = await publicAppUrl(appUrl, resolve)
  if (typeof token !== 'string' || !token.trim()) throw new CheckoutError(503, 'MERCADOPAGO_ACCESS_TOKEN no está configurado en el servidor.')
  const preference = buildPreference(order, user.id, origin)
  // La RPC confirma el consumo antes del fetch; un error de MP no lo revierte.
  const quota = await protectedRpc(client, 'elite_checkout_quota', { p_order_id: order_id })
  if (quota.allowed !== true) throw new CheckoutError(503, 'No se pudo verificar la cuota de Checkout.')
  try {
    const response = await send(endpoint, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    })
    if (!response.ok) throw new Error('Provider rejected request')
    const data = await response.json()
    const target = new URL(data.init_point)
    if (typeof data.id !== 'string' || !data.id || target.protocol !== 'https:' || target.username || target.password || !(target.hostname === 'mercadopago.com.ar' || target.hostname.endsWith('.mercadopago.com.ar') || target.hostname === 'mercadopago.com' || target.hostname.endsWith('.mercadopago.com'))) throw new Error('Invalid provider response')
    // Se devuelve únicamente la información pública necesaria para redirigir.
    return { preference_id: data.id, init_point: target.href }
  } catch {
    // Nunca propagar bodies, headers, credenciales ni mensajes crudos del proveedor.
    throw new CheckoutError(502, 'No se pudo obtener Checkout Pro de Mercado Pago. No se modificó el pedido.')
  }
}

export function checkoutFailure(error) {
  const limited = rateLimitResponse(error)
  if (limited) return limited
  if (error?.code === 'PT404' || error?.code === 'PT409') {
    return Response.json({ error: 'El pedido no está disponible para Checkout.' }, { status: Number(error.code.slice(2)), headers: { 'Cache-Control': 'private, no-store' } })
  }
  const known = error instanceof CheckoutError || error instanceof OrderError
  return Response.json({ error: known ? error.message : 'No se pudo iniciar Checkout.' }, {
    status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' },
  })
}
