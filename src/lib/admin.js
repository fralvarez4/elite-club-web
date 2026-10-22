import { readJsonBody } from './requestBody.js'
import { rateLimitResponse } from './rateLimit.js'

export class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Se consulta Auth y el perfil en cada operación, nunca el rol del navegador.
export async function requireAdmin(client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) {
    if (error && error.status >= 500) throw new AdminError(503, 'No se pudo verificar la sesión.')
    throw new AdminError(401, 'Unauthorized')
  }
  const result = await client.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (result.error) throw new AdminError(503, 'No se pudo verificar el rol.')
  if (result.data?.role !== 'admin') throw new AdminError(403, 'Forbidden')
  return data.user
}

export function adminFailure(error) {
  const limited = rateLimitResponse(error)
  if (limited) return limited
  const rpcErrors = { PT400: [400, 'Datos de producto inválidos.'], PT401: [401, 'Unauthorized'], PT403: [403, 'Forbidden'], PT404: [404, 'Producto no encontrado.'], PT409: [409, 'No se pudo completar la operación: el producto puede tener pedidos asociados.'], PT500: [500, 'No se pudo completar la operación.'], PT503: [503, 'No se pudo completar la operación.'], PGRST202: [503, 'Las operaciones administrativas todavía no están configuradas en Supabase.'] }
  if (rpcErrors[error?.code]) {
    const [status, message] = rpcErrors[error.code]
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const known = error instanceof AdminError
  if (!known) console.error('[Elite Club/admin] Error interno al completar la operación.')
  return Response.json({ error: known ? error.message : 'No se pudo completar la operación.' }, {
    status: known ? error.status : (error?.code === '42501' ? 403 : 500), headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function productInput(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new AdminError(403, 'Origen no permitido.')
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AdminError(415, 'Se requiere JSON.')
  const body = await readJsonBody(request, AdminError, 16000)
  const fields = ['name', 'size', 'brand', 'type', 'image', 'sort_order', 'price']
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) throw new AdminError(400, 'Campos no permitidos.')
  const result = {}
  for (const key of fields.filter(key => !['sort_order', 'price'].includes(key))) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > (key === 'image' ? 2000 : 200)) throw new AdminError(400, `Revisá el campo ${key}.`)
    result[key] = body[key].trim()
  }
  if (!/^\/products\/[a-zA-Z0-9_./% -]+$/.test(result.image) && !/^https:\/\//.test(result.image)) throw new AdminError(400, 'Usá una imagen de /products/ o una URL HTTPS.')
  if (!Number.isInteger(body.sort_order) || body.sort_order < 0 || body.sort_order > 2147483647) throw new AdminError(400, 'Orden inválido.')
  result.sort_order = body.sort_order
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0) throw new AdminError(400, 'El precio debe ser un número mayor que 0.')
  result.price = body.price
  return result
}
