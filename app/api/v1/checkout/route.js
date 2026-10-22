import 'server-only'
import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { createCheckout, checkoutFailure } from '../../../../src/lib/checkout'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const client = await getSupabaseServerClient()
    const result = await createCheckout(request, client, {
      appUrl: process.env.APP_URL,
      token: process.env.MERCADOPAGO_ACCESS_TOKEN,
    })
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return checkoutFailure(error) }
}
