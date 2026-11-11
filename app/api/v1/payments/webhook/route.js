import 'server-only'
import { processPaymentWebhook } from '../../../../../src/lib/paymentWebhook'

export const runtime = 'nodejs'

export async function POST(request) {
  return processPaymentWebhook(request, {
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    collectorId: process.env.MERCADOPAGO_COLLECTOR_ID,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}
