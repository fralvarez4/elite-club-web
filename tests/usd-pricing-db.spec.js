import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const userId = '11111111-1111-4111-8111-111111111111'
const delivery = { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' }
const items = [{ product_id: 'cap', quantity: 2 }]
let db

const rpc = (name, args) => db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args).then(result => result.rows[0].value)
const createOrder = () => rpc('elite_create_order', [JSON.stringify(items), JSON.stringify(delivery)])

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    create function auth.role() returns text language sql as 'select nullif(current_setting(''request.jwt.claim.role'', true), '''')';
    grant usage on schema auth to anon, authenticated, service_role;`)
  for (const file of ['001_products.sql', '002_profiles.sql', '003_products_admin.sql', '004_orders.sql',
    '005_create_order.sql', '006_order_delivery.sql', '007_products_price.sql', '008_rate_limiting.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.query('insert into auth.users values ($1,$2)', [userId, {}])
  await db.exec("insert into products(id,name,size,brand,type,image,sort_order,price) values ('cap','Cap','-','NIKE','GORRA','/products/cap.webp',0,40)")
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId])
  await db.exec("set role authenticated; select set_config('request.jwt.claim.role','authenticated',false)")
  const old = await createOrder()
  expect(old.total).toBe(80)
  await db.exec('reset role')
  await db.exec(readFileSync(new URL('../supabase/migrations/012_usd_base_ars_orders.sql', import.meta.url), 'utf8'))
})
test.afterAll(async () => { await db?.close() })

test('USD catalogue is converted server side, historic ARS order remains unchanged and rate writes are restricted', async () => {
  await db.exec("set role authenticated; select set_config('request.jwt.claim.role','authenticated',false)")
  expect((await createOrder()).code).toBe('PT503')
  await expect(rpc('elite_store_mep_rate', [1000, new Date().toISOString(), new Date().toISOString()])).rejects.toMatchObject({ code: '42501' })
  await db.exec("reset role; set role service_role; select set_config('request.jwt.claim.role','service_role',false)")
  const fetched = new Date().toISOString()
  const updated = new Date(Date.now() - 60000).toISOString()
  expect(await rpc('elite_store_mep_rate', [1000.125, updated, fetched])).toBe(true)
  await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.role','authenticated',false)")
  const order = await createOrder()
  expect(Number(order.fx_rate)).toBe(1000.125)
  expect(order.pricing_version).toBe('usd_mep_v1')
  expect(Number(order.subtotal)).toBe(80010)
  expect(Number(order.total)).toBe(80010)
  expect(Number(order.order_items[0].unit_price)).toBe(40005)
  expect(Number(order.order_items[0].unit_price_usd)).toBe(40)
  await db.exec('reset role')
  const rows = (await db.query('select pricing_version, total, fx_rate from orders order by created_at, id')).rows
  expect(rows.some(row => row.pricing_version === 'legacy_ars' && Number(row.total) === 80 && row.fx_rate === null)).toBe(true)
  expect(rows.some(row => row.pricing_version === 'usd_mep_v1' && Number(row.total) === 80010)).toBe(true)
})
