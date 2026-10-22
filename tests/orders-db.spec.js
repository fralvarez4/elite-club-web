import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
let db
test.setTimeout(60000)
const migrate = file => db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
async function asUser(index) {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [users[index]])
}
async function create(items, delivery = { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' }) {
  return (await db.query('select public.elite_create_order($1::jsonb, $2::jsonb) as result', [JSON.stringify(items), JSON.stringify(delivery)])).rows[0].result
}
test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated;`)
  for (const file of ['001_products.sql', '002_profiles.sql', '003_products_admin.sql', '004_orders.sql']) await migrate(file)
  // La columna ya existe en el proyecto remoto; solo se reproduce en el fixture local.
  await db.exec('alter table products add column price numeric')
  await migrate('005_create_order.sql')
  await migrate('006_order_delivery.sql')
  for (const id of users) await db.query('insert into auth.users values ($1,$2)', [id, { role: 'admin' }])
  await db.query("update profiles set role='admin' where user_id=$1", [users[2]])
  await db.exec("insert into products values ('a','Prenda A','M','Elite','REMERA','/products/a.webp',0,10.10),('b','Prenda B','L','Elite','REMERA','/products/b.webp',1,0.20)")
})
test.beforeEach(async () => {
  await db.exec('reset role; truncate orders cascade; update products set price=case id when \'a\' then 10.10 else 0.20 end')
})
test.afterEach(async () => { await db.exec('reset role') })
test.afterAll(async () => { await db?.close() })

test('RPC derives owner/status and calculates exact snapshots atomically from database prices', async () => {
  await asUser(0)
  const order = await create([{ product_id: 'a', quantity: 3 }, { product_id: 'b', quantity: 2 }])
  expect(order).toMatchObject({ user_id: users[0], status: 'pending', total: 30.7 })
  expect(order.order_items).toEqual([
    expect.objectContaining({ order_id: order.id, product_id: 'a', quantity: 3, unit_price: 10.1 }),
    expect.objectContaining({ order_id: order.id, product_id: 'b', quantity: 2, unit_price: 0.2 }),
  ])
  await db.exec("reset role; update products set price=25 where id='a'")
  await asUser(0)
  expect((await db.query('select unit_price::text from order_items where product_id=\'a\'')).rows[0].unit_price).toBe('10.10')
  expect((await create([{ product_id: 'a', quantity: 1 }])).total).toBe(25)
})

test('direct RPC calls cannot inject prices/status/owner or bypass item validation', async () => {
  await asUser(0)
  for (const payload of [null, {}, [], Array(101).fill({ product_id: 'a', quantity: 1 }), [null],
    [{ product_id: 'a', quantity: 1, unit_price: 0.01 }], [{ product_id: 'a', quantity: 1, user_id: users[1] }],
    [{ product_id: 'a', quantity: 1, status: 'approved' }], [{ product_id: 'a', quantity: 1, total: 0 }],
    [{ product_id: 'a', quantity: 1 }, { product_id: 'a', quantity: 1 }],
    ...[0, -1, 1.5, 100, '1', null].map(quantity => [{ product_id: 'a', quantity }]),
    [{ product_id: 'a', quantity: 1 }, { product_id: 'missing', quantity: 1 }]]) {
    await expect(create(payload)).rejects.toMatchObject({ code: 'PT400' })
  }
  expect((await db.query('select * from orders')).rows).toHaveLength(0)
  expect((await db.query('select * from order_items')).rows).toHaveLength(0)
})

test('invalid prices and overflowing totals never create partial orders', async () => {
  for (const price of [null, 0, -1, 'NaN', 'Infinity', '-Infinity', 0.001, 10000000000]) {
    await db.exec('reset role')
    await db.query("update products set price=$1 where id='b'", [price])
    await asUser(0)
    await expect(create([{ product_id: 'a', quantity: 1 }, { product_id: 'b', quantity: 1 }])).rejects.toMatchObject({ code: 'PT409' })
  }
  await db.exec("reset role; update products set price=9999999999.99 where id='a'")
  await asUser(0)
  await expect(create([{ product_id: 'a', quantity: 2 }])).rejects.toMatchObject({ code: 'PT409' })
  expect((await db.query('select * from orders')).rows).toHaveLength(0)
})

test('failure during item insertion rolls back the order header too', async () => {
  await db.exec("alter table order_items add constraint simulated_failure check (product_id <> 'b')")
  try {
    await asUser(0)
    await expect(create([{ product_id: 'a', quantity: 1 }, { product_id: 'b', quantity: 1 }])).rejects.toMatchObject({ code: '23514' })
    expect((await db.query('select * from orders')).rows).toHaveLength(0)
    expect((await db.query('select * from order_items')).rows).toHaveLength(0)
  } finally { await db.exec('reset role; alter table order_items drop constraint simulated_failure') }
})

test('RLS isolates users and lets current admins read all; direct writes remain denied', async () => {
  await asUser(0)
  const first = await create([{ product_id: 'a', quantity: 1 }])
  await asUser(1)
  const second = await create([{ product_id: 'b', quantity: 1 }])
  expect((await db.query('select id from orders')).rows).toEqual([{ id: second.id }])
  expect((await db.query('select * from order_items where order_id=$1', [first.id])).rows).toHaveLength(0)
  for (const index of [0, 1, 2]) {
    await asUser(index)
    expect((await db.query('select * from orders')).rows).toHaveLength(index === 2 ? 2 : 1)
    for (const table of ['orders', 'order_items']) {
      for (const sql of [`insert into ${table} default values`, `update ${table} set id=id`, `delete from ${table}`]) {
        await expect(db.exec(sql)).rejects.toMatchObject({ code: '42501' })
      }
    }
  }
  await db.exec('reset role')
  await db.query("update profiles set role='user' where user_id=$1", [users[2]])
  await asUser(2)
  expect((await db.query('select * from orders')).rows).toHaveLength(0)
  await db.exec('reset role')
  await db.query("update profiles set role='admin' where user_id=$1", [users[2]])
})

test('anonymous or missing identities cannot invoke RPC; legacy signature stays removed', async () => {
  expect((await db.query("select to_regprocedure('public.elite_create_order(jsonb)') as old")).rows[0].old).toBeNull()
  await db.exec('set role anon')
  await expect(create([{ product_id: 'a', quantity: 1 }])).rejects.toMatchObject({ code: '42501' })
  await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub','',false)")
  await expect(create([{ product_id: 'a', quantity: 1 }])).rejects.toMatchObject({ code: 'PT401' })
})

test('delivery is validated atomically, copied historically and protected by RLS', async () => {
  await asUser(0)
  const items = [{ product_id: 'a', quantity: 2 }]
  const pickup = { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' }
  for (const delivery of [null, {}, { ...pickup, phone: ' ' }, { ...pickup, cost: 0 }, { ...pickup, pickup_name: 'Falso' }, { ...pickup, street: 'Calle' }, { ...pickup, method: 'shipping' }]) {
    await expect(create(items, delivery)).rejects.toMatchObject({ code: 'PT400' })
  }
  expect((await db.query('select * from orders')).rows).toHaveLength(0)
  const order = await create(items, pickup)
  expect(order).toMatchObject({ subtotal: 20.2, shipping_cost: 0, total: 20.2 })
  expect(order.order_delivery.pickup_address).toBe('General Jose Gervasio Artigas 1046')
  const shipping = await create(items, { ...pickup, method: 'shipping', street: 'Calle', street_number: '10', postal_code: '1000', city: 'CABA', province: 'CABA' })
  expect(shipping.order_delivery.pickup_name).toBeNull()
  await db.exec("reset role; update delivery_options set pickup_address='Nueva' where method='pickup'")
  await asUser(0)
  expect((await db.query('select pickup_address from order_delivery where order_id=$1', [order.id])).rows[0].pickup_address).toBe('General Jose Gervasio Artigas 1046')
  await asUser(1)
  expect((await db.query('select * from order_delivery')).rows).toHaveLength(0)
  await asUser(2)
  expect((await db.query('select * from order_delivery')).rows).toHaveLength(2)
  await expect(db.exec('delete from order_delivery')).rejects.toMatchObject({ code: '42501' })
  await expect(db.exec('update delivery_options set cost=1')).rejects.toMatchObject({ code: '42501' })
  await db.exec('reset role')
  await expect(db.exec("update order_delivery set city=null where method='shipping'")).rejects.toMatchObject({ code: '23514' })
  await expect(db.exec("update delivery_options set cost=1 where method='pickup'")).rejects.toMatchObject({ code: '23514' })
})
