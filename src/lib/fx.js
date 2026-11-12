const endpoint = 'https://dolarapi.com/v1/dolares/bolsa'

export async function getMepQuote(send = globalThis.fetch, now = Date.now()) {
  const response = await send(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('FX unavailable')
  const data = await response.json()
  const updated = Date.parse(data.fechaActualizacion)
  if (data.casa !== 'bolsa' || typeof data.venta !== 'number' || !Number.isFinite(data.venta) ||
    data.venta <= 0 || data.venta >= 1000000 || !Number.isFinite(updated) ||
    updated > now || updated < now - 86400000) throw new Error('FX invalid')
  return { rate: Number(data.venta.toFixed(6)), source: 'dolarapi_mep_venta',
    updated_at: new Date(updated).toISOString(), fetched_at: new Date(now).toISOString() }
}
