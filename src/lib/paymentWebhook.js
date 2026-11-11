import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const paymentEndpoint = 'https://api.mercadopago.com/v1/payments/'
const paymentIdPattern = /^[0-9]{1,30}$/
const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function failure(status) {
  return Response.json({ error: status === 401 ? 'Notificación no autorizada.' : 'No se pudo procesar la notificación.' },
    { status, headers: { 'Cache-Control': 'no-store' } })
}

export function verifyPaymentSignature(request, secret, now = Date.now()) {
  const url = new URL(request.url)
  const id = url.searchParams.get('data.id')
  const requestId = request.headers.get('x-request-id')
  const signature = request.headers.get('x-signature')
  if (!secret || !paymentIdPattern.test(id || '') || !requestId || requestId.length > 200 || !signature) return null
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')))
  if (!/^[0-9]{10}$|^[0-9]{13}$/.test(parts.ts || '') || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) return null
  const time = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1)
  // Los reintentos del proveedor pueden llegar después del evento inicial.
  if (time > now + 5 * 60 * 1000 || time < now - 24 * 60 * 60 * 1000) return null
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest()
  const actual = Buffer.from(parts.v1, 'hex')
  return timingSafeEqual(expected, actual) ? id : null
}

export async function processPaymentWebhook(request, config, dependencies = {}) {
  const { webhookSecret, accessToken, collectorId, supabaseUrl, serviceKey } = config
  if (![webhookSecret, accessToken, collectorId, supabaseUrl, serviceKey].every(value => typeof value === 'string' && value.trim())) return failure(503)
  const id = verifyPaymentSignature(request, webhookSecret)
  if (!id) return failure(401)
  let notification
  try {
    const raw = await request.text()
    if (raw.length > 8192) return failure(413)
    notification = JSON.parse(raw)
  } catch { return failure(400) }
  if (notification?.type !== 'payment' || String(notification?.data?.id) !== id) return failure(400)

  const send = dependencies.fetch || globalThis.fetch
  let payment
  try {
    const response = await send(`${paymentEndpoint}${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return failure(502)
    payment = await response.json()
  } catch { return failure(502) }
  const amount = payment?.transaction_amount
  if (String(payment?.id) !== id || !orderIdPattern.test(payment?.external_reference || '') ||
    String(payment?.collector_id) !== collectorId || payment?.currency_id !== 'ARS' ||
    typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) return failure(409)

  try {
    const client = dependencies.client || createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await client.rpc('elite_record_payment', {
      p_order_id: payment.external_reference, p_payment_id: id, p_status: payment.status,
      p_amount: amount, p_currency: payment.currency_id, p_collector_id: collectorId,
    })
    if (error) return failure(409)
  } catch { return failure(503) }
  return Response.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } })
}
