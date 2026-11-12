// Preload exclusivo del servidor de pruebas. Nunca contacta Mercado Pago real.
const originalFetch = globalThis.fetch
globalThis.fetch = function (input, init) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
  if (url.startsWith('https://api.mercadopago.com/')) {
    if (init?.headers?.Authorization !== 'Bearer fixture-mp-token') throw new Error('Unexpected provider request in test')
    if (url.startsWith('https://api.mercadopago.com/v1/payments/search?')) return originalFetch('http://127.0.0.1:3101/fixtures/mercadopago-payments', init)
    if (/^https:\/\/api\.mercadopago\.com\/v1\/payments\/\d+$/.test(url)) return originalFetch(`http://127.0.0.1:3101/fixtures/mercadopago-payment/${url.split('/').pop()}`, init)
    if (url !== 'https://api.mercadopago.com/checkout/preferences') throw new Error('Unexpected provider request in test')
    return originalFetch('http://127.0.0.1:3101/fixtures/mercadopago', init)
  }
  if (url === 'https://dolarapi.com/v1/dolares/bolsa') return Promise.resolve(Response.json({
    casa: 'bolsa', venta: 1000, fechaActualizacion: new Date(Date.now() - 60000).toISOString(),
  }))
  return originalFetch(input, init)
}
