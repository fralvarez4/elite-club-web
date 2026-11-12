import { readJsonBody } from './requestBody.js'
import { deliverySchema } from './delivery.js'
import { rateLimitResponse } from './rateLimit.js'

export class OrderError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export const orderColumns = 'id,user_id,status,subtotal,shipping_cost,total,pricing_version,fx_rate,fx_source,fx_date,fx_fetched_at,created_at,order_delivery(*)'
export const orderDetailColumns = `${orderColumns},order_items(id,order_id,product_id,quantity,unit_price,unit_price_usd,products(name,brand,size))`

export async function requireOrderUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error && (error.status >= 500 || error.name === 'AuthRetryableFetchError')) throw new OrderError(503, 'No se pudo verificar la sesión.')
  if (error || !data?.user) throw new OrderError(401, 'Unauthorized')
  return data.user
}

export async function orderReader(client) {
  const user = await requireOrderUser(client)
  const { data, error } = await client.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (error) {
    console.error('[Elite Club/orders] No se pudo consultar el rol.', { category: 'profile_lookup_failed' })
    throw new OrderError(503, 'No se pudo verificar el acceso a pedidos.')
  }
  return { user, isAdmin: data?.role === 'admin' }
}

export function ordersResponse(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...headers, 'Cache-Control': 'private, no-store' } })
}

export function ordersFailure(error) {
  const limited = rateLimitResponse(error)
  if (limited) return limited
  if (error instanceof OrderError) return ordersResponse({ error: error.message }, error.status)
  const messages = {
    PT400: [400, 'Pedido inválido: revisá los productos y sus cantidades.'],
    PT401: [401, 'Unauthorized'],
    PT409: [409, 'No se pudo crear el pedido: revisá los precios o el importe total.'],
    PT503: [503, 'No hay una cotización MEP reciente. Probá más tarde.'],
    '42501': [403, 'Forbidden'],
    '55P03': [409, 'Los productos se están actualizando. Consultá nuevamente antes de intentar crear el pedido.'],
    PGRST202: [503, 'La creación de pedidos todavía no está configurada en Supabase.'],
  }
  const [status, message] = messages[error?.code] || [503, 'No se pudo completar la operación de pedidos.']
  console.error('[Elite Club/orders] Error de Supabase.', { category: 'database_operation_failed' })
  return ordersResponse({ error: message }, status)
}

export function validateOrderItems(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'items')) throw new OrderError(400, 'Solo se acepta el campo items.')
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw new OrderError(400, 'Enviá entre 1 y 100 ítems.')
  const seen = new Set()
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['product_id', 'quantity'].includes(key))) throw new OrderError(400, 'Cada ítem acepta únicamente product_id y quantity.')
    if (typeof item.product_id !== 'string' || !item.product_id.trim() || item.product_id.length > 200 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new OrderError(400, 'Producto o cantidad inválidos: quantity debe ser un entero entre 1 y 99.')
    if (seen.has(item.product_id)) throw new OrderError(400, 'No repitas product_id; indicá su cantidad en un solo ítem.')
    seen.add(item.product_id)
  }
  return body.items
}

export async function orderInput(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new OrderError(403, 'Origen no permitido.')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new OrderError(415, 'Se requiere JSON.')
  const body = await readJsonBody(request, OrderError, 16384)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['items', 'delivery'].includes(key))) throw new OrderError(400, 'Solo se aceptan items y delivery.')
  const items = validateOrderItems({ items: body.items })
  const delivery = deliverySchema.safeParse(body.delivery)
  if (!delivery.success) throw new OrderError(400, 'Datos de entrega inválidos: revisá los campos obligatorios y no envíes importes ni datos del punto de retiro.')
  return { items, delivery: delivery.data }
}

export function orderPagination(url) {
  const params = new URL(url).searchParams
  if ([...params.keys()].some(key => !['limit', 'offset', 'scope'].includes(key))) throw new OrderError(400, 'Parámetros no permitidos.')
  const read = (key, fallback, min, max) => {
    const raw = params.get(key) ?? String(fallback)
    const value = Number(raw)
    if (params.getAll(key).length > 1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new OrderError(400, `Parámetro ${key} inválido.`)
    return value
  }
  const scope = params.get('scope') ?? 'mine'
  if (params.getAll('scope').length > 1 || !['mine', 'all'].includes(scope)) throw new OrderError(400, 'Parámetro scope inválido.')
  return { limit: read('limit', 20, 1, 100), offset: read('offset', 0, 0, 10000), scope }
}

export function validateOrderId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new OrderError(400, 'ID de pedido inválido.')
}
