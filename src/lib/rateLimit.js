// PostgREST conserva code/details en los errores de supabase-js.
// Nunca propagamos message, hint ni detalles internos al cliente.
export function rateLimitResponse(error) {
  if (error?.code !== 'PT429') return null
  let seconds
  try { seconds = JSON.parse(error.details)?.retry_after } catch { /* Sin Retry-After si no es confiable. */ }
  const headers = { 'Cache-Control': 'private, no-store' }
  if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600) headers['Retry-After'] = String(seconds)
  return Response.json({ error: 'Demasiadas solicitudes. Esperá un momento antes de volver a intentar.' }, { status: 429, headers })
}

export async function protectedRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  // Defensa adicional para transportes que no respeten response.status.
  if (/^PT\d{3}$/.test(data?.code)) throw data
  if (!data) throw new Error('La operación protegida no devolvió un resultado.')
  return data
}

export async function consumeReadQuota(client, area) {
  const data = await protectedRpc(client, 'elite_consume_read_quota', { p_area: area })
  if (data.allowed !== true) throw new Error('No se pudo verificar la cuota.')
}
