import { readJsonBody } from './requestBody.js'
// Módulo de servidor: utiliza DNS/Node y nunca debe importarse desde la interfaz.
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { z } from 'zod'
import { requireOrderUser, OrderError } from './orders.js'
import { protectedRpc, rateLimitResponse } from './rateLimit.js'

const bodySchema = z.object({ order_id: z.string().uuid() }).strict()
const endpoint = 'https://api.mercadopago.com/checkout/preferences'
const paymentsEndpoint = 'https://api.mercadopago.com/v1/payments/'
const columns = 'id,user_id,status,pricing_version,subtotal,shipping_cost,total,order_delivery(method),order_items(id,product_id,quantity,unit_price,products(name))'
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
  if (order.pricing_version !== 'usd_mep_v1') throw new CheckoutError(409, 'Este pedido anterior no tiene una cotización ARS verificada. Creá un pedido nuevo para pagar.')
  if (order.currency && order.currency !== 'ARS') throw new CheckoutError(409, 'El pedido debe estar expresado en ARS para Mercado Pago.')
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

function checkoutDestination(data) {
  const target = new URL(data?.init_point)
  if (typeof data?.preference_id !== 'string' || !data.preference_id || target.protocol !== 'https:' || target.username || target.password ||
    !(target.hostname === 'mercadopago.com.ar' || target.hostname.endsWith('.mercadopago.com.ar') || target.hostname === 'mercadopago.com' || target.hostname.endsWith('.mercadopago.com'))) throw new Error('Invalid provider response')
  return { preference_id: data.preference_id, init_point: target.href }
}

async function verifyPreviousPayments(order, token, collectorId, preferenceClient, send) {
  const url = new URL(`${paymentsEndpoint}search`)
  url.searchParams.set('external_reference', order.id)
  url.searchParams.set('sort', 'date_created')
  url.searchParams.set('criteria', 'desc')
  url.searchParams.set('limit', '50')
  url.searchParams.set('offset', '0')
  const options = { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }
  let found
  try {
    const response = await send(url.href, options)
    if (!response.ok) throw new Error('Payment search unavailable')
    found = await response.json()
  } catch { throw new CheckoutError(503, 'No pudimos comprobar pagos anteriores en Mercado Pago. No intentes pagar otra vez hasta que la tienda revise el pedido.') }
  if (!Array.isArray(found?.results) || !Number.isSafeInteger(found?.paging?.total) || found.paging.total !== found.results.length || found.results.length > 50) {
    throw new CheckoutError(503, 'La consulta de pagos no fue concluyente. Contactá a la tienda antes de reintentar.')
  }
  for (const result of found.results) {
    const id = String(result?.id || '')
    if (!/^[0-9]{1,30}$/.test(id)) throw new CheckoutError(503, 'Mercado Pago devolvió un pago inválido. Contactá a la tienda.')
    let payment
    try {
      const response = await send(`${paymentsEndpoint}${id}`, options)
      if (!response.ok) throw new Error('Payment lookup unavailable')
      payment = await response.json()
    } catch { throw new CheckoutError(503, 'No pudimos verificar un pago anterior. Contactá a la tienda antes de reintentar.') }
    let matches = false
    try { matches = String(payment?.id) === id && payment.external_reference === order.id &&
      String(payment.collector_id) === collectorId && payment.currency_id === 'ARS' &&
      cents(payment.transaction_amount) === cents(order.total) } catch { /* Pago inconsistente. */ }
    if (!matches) throw new CheckoutError(409, 'Hay un pago con datos distintos para este pedido. Contactá a la tienda antes de reintentar.')
    if (payment.status === 'approved') {
      try {
        await protectedRpc(preferenceClient, 'elite_record_payment', {
          p_order_id: order.id, p_payment_id: id, p_status: 'approved', p_amount: payment.transaction_amount,
          p_currency: 'ARS', p_collector_id: collectorId,
        })
      } catch { throw new CheckoutError(503, 'Encontramos un pago aprobado, pero no pudimos actualizar el pedido. Contactá a la tienda; no pagues de nuevo.') }
      throw new CheckoutError(409, 'Este pedido ya tiene un pago aprobado en Mercado Pago. Actualizá Mis pedidos; no pagues de nuevo.')
    }
    if (!['rejected', 'cancelled'].includes(payment.status)) throw new CheckoutError(409, 'Mercado Pago registra un pago en proceso o que requiere revisión. No pagues de nuevo; consultá a la tienda.')
  }
}

export async function createCheckout(request, client, { appUrl, token, collectorId, preferenceClient, fetch: send = globalThis.fetch, resolve = lookup }) {
  const user = await requireOrderUser(client)
  const { order_id } = await checkoutInput(request)
  const { data: order, error } = await client.from('orders').select(columns).eq('id', order_id).eq('user_id', user.id).maybeSingle()
  if (error) throw new CheckoutError(503, 'No se pudo consultar el pedido.')
  if (!order || order.user_id !== user.id) throw new CheckoutError(404, 'Pedido no encontrado.')
  const origin = await publicAppUrl(appUrl, resolve)
  if (typeof token !== 'string' || !token.trim()) throw new CheckoutError(503, 'MERCADOPAGO_ACCESS_TOKEN no está configurado en el servidor.')
  if (!preferenceClient?.rpc) throw new CheckoutError(503, 'El registro de Checkout no está configurado.')
  const preference = buildPreference(order, user.id, origin)
  // La RPC confirma el consumo antes del fetch; un error de MP no lo revierte.
  const quota = await protectedRpc(client, 'elite_checkout_quota', { p_order_id: order_id })
  if (quota.allowed !== true) throw new CheckoutError(503, 'No se pudo verificar la cuota de Checkout.')
  const claim = await protectedRpc(preferenceClient, 'elite_claim_checkout_preference', { p_order_id: order_id, p_user_id: user.id })
  if (claim.state === 'ready') {
    if (!/^[0-9]{1,30}$/.test(String(collectorId || ''))) throw new CheckoutError(503, 'No se pudo verificar el vendedor de Mercado Pago.')
    await verifyPreviousPayments(order, token, collectorId, preferenceClient, send)
    const { data: saved, error: savedError } = await preferenceClient.from('checkout_preferences').select('created_at').eq('order_id', order_id).maybeSingle()
    if (savedError || !saved?.created_at || !Number.isFinite(Date.parse(saved.created_at))) throw new CheckoutError(503, 'No pudimos comprobar cuándo se inició el pago. Contactá a la tienda antes de reintentar.')
    if (Date.now() - Date.parse(saved.created_at) < 5 * 60 * 1000) throw new CheckoutError(409, 'El pago anterior puede seguir procesándose. Esperá cinco minutos y actualizá Mis pedidos antes de reintentar.')
    try { return checkoutDestination(claim) } catch { throw new CheckoutError(503, 'La Preference guardada no es válida.') }
  }
  if (claim.state === 'creating') throw new CheckoutError(409, 'La Preference de este pedido está pendiente de verificación. Contactá a la tienda antes de reintentar.')
  if (claim.state !== 'claimed' || !/^[0-9a-f-]{36}$/i.test(claim.claim_token || '')) throw new CheckoutError(503, 'No se pudo reservar Checkout.')
  const release = async () => { try { await preferenceClient.rpc('elite_release_checkout_preference', { p_order_id: order_id, p_user_id: user.id, p_claim_token: claim.claim_token }) } catch { /* La reserva incierta permanece cerrada. */ } }
  let destination
  try {
    const response = await send(endpoint, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    })
    if (!response.ok) {
      // Un 408/409/429 puede ser ambiguo: no arriesgar una segunda Preference.
      if ([400, 401, 403, 404, 422].includes(response.status)) await release()
      throw new Error('Provider rejected request')
    }
    const data = await response.json()
    destination = checkoutDestination({ preference_id: data.id, init_point: data.init_point })
  } catch {
    // Nunca propagar bodies, headers, credenciales ni mensajes crudos del proveedor.
    throw new CheckoutError(502, 'No se pudo confirmar Checkout Pro. Si el error persiste, consultá a la tienda antes de reintentar.')
  }
  try {
    await protectedRpc(preferenceClient, 'elite_finish_checkout_preference', {
      p_order_id: order_id, p_user_id: user.id, p_claim_token: claim.claim_token,
      p_preference_id: destination.preference_id, p_init_point: destination.init_point,
    })
  } catch { throw new CheckoutError(503, 'La Preference se creó pero no pudo registrarse. Contactá a la tienda; no repitas el pago.') }
  return destination
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
