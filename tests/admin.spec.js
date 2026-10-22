import { test, expect } from '@playwright/test'
import { requireAdmin, productInput } from '../src/lib/admin.js'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

test('server authorization verifies Auth identity and current profile UUID', async () => {
  const queried = []
  let role = 'user'
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-uuid', user_metadata: { role: 'admin' } } } }) },
    from: table => { expect(table).toBe('profiles'); return { select: field => {
      expect(field).toBe('role')
      return { eq: (key, value) => { queried.push([key, value]); return { maybeSingle: async () => ({ data: { role } }) } } }
    } } },
  }
  await expect(requireAdmin(client)).rejects.toMatchObject({ status: 403 })
  role = 'admin'
  await expect(requireAdmin(client)).resolves.toMatchObject({ id: 'verified-uuid' })
  role = 'user'
  await expect(requireAdmin(client)).rejects.toMatchObject({ status: 403 })
  expect(queried).toEqual(Array(3).fill(['user_id', 'verified-uuid']))
  client.auth.getUser = async () => ({ data: { user: null }, error: { status: 401 } })
  await expect(requireAdmin(client)).rejects.toMatchObject({ status: 401 })
})

test('admin page and each endpoint reject visitors independently', async ({ request }) => {
  expect((await request.get('/admin')).status()).toBe(401)
  for (const [method, path] of [['get', ''], ['post', ''], ['patch', '/missing'], ['delete', '/missing']]) {
    const response = await request[method](`/api/admin/products${path}`)
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  }
})

test('mutation validation rejects foreign origins, extra fields and malformed values', async () => {
  const data = { name: 'Prenda', brand: 'Elite', size: 'M', type: 'Remera', image: '/products/test.webp', sort_order: 1, price: 12500.5 }
  const make = (body, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/admin/products', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  await expect(productInput(make(data))).resolves.toEqual(data)
  await expect(productInput(make(data, 'https://otro.test'))).rejects.toMatchObject({ status: 403 })
  for (const extra of [{ role: 'admin' }, { id: 'changed' }, { sort_order: -1 }, { image: 'javascript:alert(1)' }, { name: '' }, ...[undefined, null, '', '123', 0, -1, Infinity, NaN].map(price => ({ price }))]) {
    await expect(productInput(make({ ...data, ...extra }))).rejects.toMatchObject({ status: 400 })
  }
})

test('products RLS preserves public reads and restricts CRUD to admins without role escalation', async () => {
  test.setTimeout(60000)
  const db = new PGlite()
  const user = '11111111-1111-4111-8111-111111111111'
  const admin = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth to anon, authenticated;`)
    for (const file of ['001_products.sql', '002_profiles.sql', '003_products_admin.sql']) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    await db.exec(`insert into auth.users values ('${user}', '{}'), ('${admin}', '{}'); update public.profiles set role='admin' where user_id='${admin}';
      insert into products values ('one','Prenda','M','Elite','Remera','/products/test.webp',0); set role anon;`)
    expect((await db.query('select * from products')).rows).toHaveLength(1)
    await expect(db.exec("insert into products values ('two','Prenda','L','Elite','Remera','/products/test.webp',1)")).rejects.toMatchObject({ code: '42501' })
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`)
    await expect(db.exec("insert into products values ('two','Prenda','L','Elite','Remera','/products/test.webp',1)")).rejects.toMatchObject({ code: '42501' })
    expect((await db.query("update products set name='hack' returning id")).rows).toHaveLength(0)
    expect((await db.query('delete from products returning id')).rows).toHaveLength(0)
    await expect(db.exec("update profiles set role='admin'")).rejects.toMatchObject({ code: '42501' })
    await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`)
    await db.exec("insert into products values ('two','Prenda','L','Elite','Remera','/products/test.webp',1)")
    expect((await db.query("update products set name='Editada' where id='two' returning id")).rows).toHaveLength(1)
    expect((await db.query("delete from products where id='two' returning id")).rows).toHaveLength(1)
    await expect(db.exec("update profiles set role='user'")).rejects.toMatchObject({ code: '42501' })
    await db.exec(`reset role; update profiles set role='user' where user_id='${admin}'; set role authenticated`)
    expect((await db.query('delete from products returning id')).rows).toHaveLength(0)
  } finally { await db.close() }
})
