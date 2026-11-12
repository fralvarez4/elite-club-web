import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../supabase/migrations/011_checkout_preferences.sql', import.meta.url), 'utf8')
const userId = '11111111-1111-4111-8111-111111111111'
const orderId = '22222222-2222-4222-8222-222222222222'
let db

test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.role() returns text language sql as
      'select nullif(current_setting(''request.jwt.claim.role'', true), '''')';
    grant usage on schema auth to authenticated, service_role;
    create table public.orders (id uuid primary key, user_id uuid not null references auth.users(id), status text not null);
    insert into auth.users values ('${userId}');
    insert into public.orders values ('${orderId}', '${userId}', 'pending');
  `)
  await db.exec(migration)
})
test.afterAll(async () => { await db?.close() })
test.afterEach(async () => { await db.exec('reset role') })

test('service role reserves once and reuses the recorded preference; clients cannot access it', async () => {
  const claim = () => db.query('select public.elite_claim_checkout_preference($1,$2) as value', [orderId, userId]).then(result => result.rows[0].value)
  await db.exec("set role authenticated; select set_config('request.jwt.claim.role', 'authenticated', false)")
  await expect(claim()).rejects.toMatchObject({ code: '42501' })
  await expect(db.query('select * from public.checkout_preferences')).rejects.toMatchObject({ code: '42501' })
  await db.exec("reset role; set role service_role; select set_config('request.jwt.claim.role', 'service_role', false)")
  const first = await claim()
  expect(first.state).toBe('claimed')
  expect((await claim()).state).toBe('creating')
  const destination = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1'
  const finished = (await db.query('select public.elite_finish_checkout_preference($1,$2,$3,$4,$5) as value', [orderId, userId, first.claim_token, 'pref-1', destination])).rows[0].value
  expect(finished).toMatchObject({ state: 'ready', preference_id: 'pref-1', init_point: destination })
  expect(await claim()).toMatchObject(finished)
  expect((await db.query('select public.elite_release_checkout_preference($1,$2,$3) as value', [orderId, userId, first.claim_token])).rows[0].value).toBe(false)
})
