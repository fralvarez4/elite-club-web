import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../supabase/migrations/010_payment_webhooks.sql', import.meta.url), 'utf8')
const orderId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
let db

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as
      'select nullif(current_setting(''request.jwt.claim.role'', true), '''')';
    grant usage on schema auth to service_role, authenticated;
    create table public.orders (id uuid primary key, status text not null, total numeric(12,2) not null);
    insert into public.orders values ('${orderId}', 'pending', 150.50), ('${otherId}', 'pending', 150.50);
  `)
  await db.exec(migration)
})
test.afterAll(async () => { await db?.close() })
test.afterEach(async () => { await db.exec('reset role') })

test('only service role can record a payment; amount and payment ID are bound to one order', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.role', 'authenticated', false)`)
  await expect(db.query('select public.elite_record_payment($1,$2,$3,$4,$5,$6)', [orderId, '123', 'approved', 150.5, 'ARS', '456'])).rejects.toMatchObject({ code: '42501' })
  await db.exec(`reset role; set role service_role; select set_config('request.jwt.claim.role', 'service_role', false)`)
  const record = (order, payment, status, amount = 150.5) => db.query('select public.elite_record_payment($1,$2,$3,$4,$5,$6) as status', [order, payment, status, amount, 'ARS', '456'])
  expect((await record(orderId, '123', 'pending')).rows[0].status).toBe('pending')
  expect((await record(orderId, '123', 'approved')).rows[0].status).toBe('approved')
  expect((await record(orderId, '123', 'approved')).rows[0].status).toBe('approved')
  await expect(record(otherId, '123', 'approved')).rejects.toMatchObject({ code: 'PT409' })
  await expect(record(otherId, '456', 'approved', 1)).rejects.toMatchObject({ code: 'PT409' })
  await db.exec('reset role')
  expect((await db.query('select count(*)::int as count from public.payment_events')).rows[0].count).toBe(1)
  expect((await db.query('select status from public.orders where id = $1', [otherId])).rows[0].status).toBe('pending')
})
