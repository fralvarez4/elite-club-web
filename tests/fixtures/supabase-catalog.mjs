// Catálogo local para las pruebas de navegador; no contiene precios ni usuarios reales.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const products = JSON.parse(readFileSync(new URL('../../src/data/products.json', import.meta.url), 'utf8'))
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json')
  if (request.method === 'GET' && new URL(request.url, 'http://127.0.0.1:3999').pathname === '/rest/v1/products') {
    response.end(JSON.stringify(products))
  } else {
    response.writeHead(503)
    response.end('{"message":"Fixture unavailable"}')
  }
}).listen(3999, '127.0.0.1')
