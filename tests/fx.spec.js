import { test, expect } from '@playwright/test'
import { getMepQuote } from '../src/lib/fx.js'

const now = Date.parse('2026-11-11T15:00:00Z')
const response = (venta, fechaActualizacion = new Date(now - 60000).toISOString()) =>
  async () => Response.json({ casa: 'bolsa', venta, fechaActualizacion })

test('MEP quote keeps provider time and rejects missing, stale or invalid rates', async () => {
  expect(await getMepQuote(response(1000.125), now)).toEqual({ rate: 1000.125,
    source: 'dolarapi_mep_venta', updated_at: new Date(now - 60000).toISOString(), fetched_at: new Date(now).toISOString() })
  for (const send of [response(0), response(-1), response('1000'), response(Infinity),
    response(1000, new Date(now - 86400001).toISOString()),
    response(1000, new Date(now + 1000).toISOString()),
    async () => Response.json({ casa: 'oficial', venta: 1000, fechaActualizacion: new Date(now).toISOString() })]) {
    await expect(getMepQuote(send, now)).rejects.toThrow()
  }
})
