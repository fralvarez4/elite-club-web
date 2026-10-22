// Preload exclusivo del servidor de pruebas. Nunca contacta Mercado Pago real.
const originalFetch = globalThis.fetch
globalThis.fetch = function (input, init) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
  if (url.startsWith('https://api.mercadopago.com/')) {
    if (url !== 'https://api.mercadopago.com/checkout/preferences' || init?.headers?.Authorization !== 'Bearer fixture-mp-token') throw new Error('Unexpected provider request in test')
    return originalFetch('http://127.0.0.1:3101/fixtures/mercadopago', init)
  }
  return originalFetch(input, init)
}
