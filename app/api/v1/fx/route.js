import 'server-only'
import { getMepQuote } from '../../../../src/lib/fx'

export async function GET() {
  try {
    const quote = await getMepQuote()
    return Response.json({ rate: quote.rate, source: 'DolarAPI MEP venta', updated_at: quote.updated_at },
      { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch {
    return Response.json({ error: 'Cotización no disponible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
