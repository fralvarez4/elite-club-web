import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { getProducts } from '../src/lib/products.js'
import { getSupabaseClient } from '../src/lib/supabase.js'
import { generateProductsSeed } from '../scripts/generate-products-seed.mjs'

const products = JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'))
const url = 'https://test.supabase.co'
const key = 'sb_publishable_test'
function captureLogs() {
  const logs = { warnings: [], errors: [] }
  return { ...logs, warn: (...args) => logs.warnings.push(args), error: (...args) => logs.errors.push(args) }
}
function clientWith(fetch) { return () => getSupabaseClient({ url, key, fetch }) }

test('Supabase reads with publishable key and original catalog order without caching', async () => {
  let request
  const result = await getProducts({ clientFactory: clientWith(async (input, init) => {
    request = { url: new URL(input), init }
    return new Response(JSON.stringify(products.map(product => ({ ...product, price: 12500.5 }))), { headers: { 'Content-Type': 'application/json' } })
  }) })
  expect(result).toEqual(products.map(product => ({ ...product, price: 12500.5 })))
  expect(request.url.pathname).toBe('/rest/v1/products')
  expect(request.url.searchParams.get('select')).toBe('id,name,size,brand,type,image,price')
  expect(request.url.searchParams.get('order')).toBe('sort_order.asc,id.asc')
  expect(request.init.method).toBe('GET')
  expect(request.init.cache).toBe('no-store')
  expect(new Headers(request.init.headers).get('apikey')).toBe(key)
})

test('missing configuration explicitly warns before using the temporary backup', async () => {
  const logger = captureLogs()
  const result = await getProducts({ clientFactory: () => getSupabaseClient({ url: '', key: '' }), logger })
  expect(result).toEqual(products)
  expect(logger.warnings[0][0]).toContain('sin configurar')
  expect(logger.errors).toHaveLength(0)
})

test('configured Supabase errors log a safe diagnostic category before fallback', async () => {
  const logger = captureLogs()
  const result = await getProducts({ logger, clientFactory: clientWith(async () => new Response(
    JSON.stringify({ code: '42501', message: 'permission denied for table products', details: 'SELECT denied', hint: 'Check grants' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )) })
  expect(result).toEqual(products)
  expect(logger.errors).toHaveLength(1)
  expect(logger.errors[0][0]).toContain('ERROR al leer Supabase')
  expect(logger.errors[0][1]).toEqual({ category: 'permission_denied' })
  expect(JSON.stringify(logger.errors)).not.toContain('permission denied for table products')
})

test('network failures are reported and empty successful responses remain empty', async () => {
  const logger = captureLogs()
  expect(await getProducts({ logger, clientFactory: clientWith(async () => { throw new Error('Network offline') }) })).toEqual(products)
  expect(logger.errors).toHaveLength(1)
  expect(logger.errors[0][1]).toEqual({ category: 'catalog_read_failed' })
  expect(JSON.stringify(logger.errors)).not.toContain('Network offline')
  expect(await getProducts({ logger, clientFactory: clientWith(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })) })).toEqual([])
  expect(logger.warnings[0][0]).toContain('0 productos')
})

test('partial configuration or non-publishable credentials fail explicitly without logging keys', async () => {
  const logger = captureLogs()
  for (const configuration of [{ url, key: '' }, { url, key: 'sb_secret_do_not_log' }, { url: 'invalid', key }]) {
    expect(await getProducts({ logger, clientFactory: () => getSupabaseClient(configuration) })).toEqual(products)
  }
  expect(logger.errors).toHaveLength(3)
  expect(JSON.stringify(logger.errors)).not.toContain('sb_secret_do_not_log')
})

test('seed preserves all 74 IDs, fields and positions and is reproducible', () => {
  const sql = generateProductsSeed(products)
  expect(products).toHaveLength(74)
  expect(sql).toBe(readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8'))
  for (const [index, product] of products.entries()) {
    const values = ['id', 'name', 'size', 'brand', 'type', 'image'].map(field => `'${product[field].replaceAll("'", "''")}'`)
    expect(sql).toContain(`(${[...values, index].join(', ')})`)
  }
  expect(sql).toContain('on conflict (id) do update')
  expect(() => generateProductsSeed([products[0], products[0]])).toThrow('ID duplicado')
  expect(generateProductsSeed([{ ...products[0], name: "Kid's tee" }])).toContain("'Kid''s tee'")
})
