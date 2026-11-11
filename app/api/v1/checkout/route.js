import 'server-only'
import { getSupabaseServerClient } from '../../../../src/lib/supabaseServer'
import { createCheckout, checkoutFailure } from '../../../../src/lib/checkout'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    if (!process.env.MERCADOPAGO_WEBHOOK_SECRET || !process.env.MERCADOPAGO_COLLECTOR_ID || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Los pagos aún no están habilitados: falta configurar la confirmación segura.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
    }
    const client = await getSupabaseServerClient()
    const preferenceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await createCheckout(request, client, {
      appUrl: process.env.APP_URL,
      token: process.env.MERCADOPAGO_ACCESS_TOKEN,
      preferenceClient,
    })
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return checkoutFailure(error) }
}
