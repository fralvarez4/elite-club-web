import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { processPaymentWebhook, verifyPaymentSignature } from '../src/lib/paymentWebhook.js'

const orderId = '11111111-1111-4111-8111-111111111111'
const config = { webhookSecret: 'fixture-signing-secret', accessToken: 'fixture-access-token', collectorId: '1234', supabaseUrl: 'https://example.supabase.co', serviceKey: 'fixture-service-key' }

function notification({ secret = config.webhookSecret, timestamp = Date.now(), id = '4567' } = {}) {
  const ts = String(timestamp)
  const requestId = 'request-123'
  const manifest = `id:${id};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
  return new Request(`https://store.example/api/v1/payments/webhook?data.id=${id}`, {
    method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}` },
    body: JSON.stringify({ type: 'payment', data: { id } }),
  })
}

test('webhook verifies HMAC before fetching and rejects expired or forged notifications', async () => {
  const valid = notification()
  expect(verifyPaymentSignature(valid, config.webhookSecret)).toBe('4567')
  expect(verifyPaymentSignature(notification({ secret: 'wrong' }), config.webhookSecret)).toBeNull()
  expect(verifyPaymentSignature(notification({ timestamp: Date.now() - 25 * 3600000 }), config.webhookSecret)).toBeNull()
  let calls = 0
  const response = await processPaymentWebhook(notification({ secret: 'wrong' }), config, { fetch: () => { calls++; throw Error('unexpected') } })
  expect(response.status).toBe(401)
  expect(calls).toBe(0)
})

test('webhook retrieves the payment and records only verified ARS payments for the configured seller', async () => {
  const calls = []
  const payment = { id: 4567, external_reference: orderId, collector_id: 1234, currency_id: 'ARS', transaction_amount: 150.5, status: 'approved' }
  const dependencies = {
    fetch: async (url, options) => {
      calls.push({ url, options })
      return Response.json(payment)
    },
    client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'approved', error: null } } },
  }
  const response = await processPaymentWebhook(notification(), config, dependencies)
  expect(response.status).toBe(200)
  expect(calls[0].url).toBe('https://api.mercadopago.com/v1/payments/4567')
  expect(calls[1]).toEqual({ name: 'elite_record_payment', args: {
    p_order_id: orderId, p_payment_id: '4567', p_status: 'approved', p_amount: 150.5,
    p_currency: 'ARS', p_collector_id: '1234',
  } })
  payment.collector_id = 9999
  expect((await processPaymentWebhook(notification(), config, dependencies)).status).toBe(409)
  expect(calls).toHaveLength(3)
})

test('webhook fails closed when confirmation is not configured', async () => {
  expect((await processPaymentWebhook(notification(), { ...config, serviceKey: '' })).status).toBe(503)
})
