import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { rateLimitResponse, protectedRpc, consumeReadQuota } from '../src/lib/rateLimit.js'
import { adminFailure } from '../src/lib/admin.js'
import { ordersFailure } from '../src/lib/orders.js'
import { createCheckout, checkoutFailure } from '../src/lib/checkout.js'

const users = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const product = { name: 'Prenda', size: 'M', brand: 'Elite', type: 'REMERA', image: '/products/a.webp', sort_order: 1, price: 10.1 }
const delivery = { method: 'pickup', first_name: 'Ana', last_name: 'Perez', phone: '123' }
let db
const migrate = name => db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
async function asUser(index) {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [users[index]])
}
async function rpc(name, args = []) {
  return (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result
}
const create = (items = [{ product_id: 'a', quantity: 1 }]) => rpc('elite_create_order', [JSON.stringify(items), JSON.stringify(delivery)])
async function counters() {
  await db.exec('reset role')
  return (await db.query('select * from elite_security.rate_counters order by action, period_seconds')).rows
}
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated;`)
  for (const file of ['001_products.sql','002_profiles.sql','003_products_admin.sql','004_orders.sql']) await migrate(file)
  await migrate('005_create_order.sql')
  await migrate('006_order_delivery.sql')
  await migrate('007_products_price.sql')
  await migrate('008_rate_limiting.sql')
  for (const id of users) await db.query('insert into auth.users values ($1,$2)', [id, {}])
  await db.query("update profiles set role='admin' where user_id=$1", [users[2]])
  await db.exec("insert into products values ('a','Prenda','M','Elite','REMERA','/products/a.webp',0,10.10)")
})
beforeEach(async () => {
  await db.exec('reset role; truncate orders cascade; truncate elite_security.rate_counters;')
  await db.exec("delete from products where id <> 'a'; update products set price=10.10 where id='a'")
})
after(async () => { await db?.close() })

test('clean sequence produces required numeric price without default and rejects unpriced imports', async () => {
  const column = (await db.query(`select data_type, numeric_precision, numeric_scale, is_nullable, column_default
    from information_schema.columns where table_schema='public' and table_name='products' and column_name='price'`)).rows[0]
  assert.deepEqual(column, { data_type:'numeric', numeric_precision:null, numeric_scale:null, is_nullable:'NO', column_default:null })
  await assert.rejects(db.exec("insert into products(id,name,size,brand,type,image,sort_order) values ('missing','Prenda','M','Elite','REMERA','/products/a.webp',1)"), { code:'23502' })
})

for (const type of ['numeric','numeric(12,2)']) {
  test(`existing ${type}: 007 then 008 preserve every product, order, item, delivery, user and profile`, async () => {
    const existing = new PGlite()
    const apply = name => existing.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    try {
      await existing.exec(`create role anon; create role authenticated; create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
        grant usage on schema auth to anon, authenticated;`)
      for (const name of ['001_products.sql','002_profiles.sql','003_products_admin.sql','004_orders.sql']) await apply(name)
      await existing.exec(`alter table products add column price ${type} default 0`)
      await apply('005_create_order.sql')
      await existing.query('insert into auth.users values ($1,$2)', [users[0], {}])
      await existing.exec("insert into products(id,name,size,brand,type,image,sort_order,price) values ('a','Prenda','M','Elite','REMERA','/products/a.webp',0,12345.67)")
      await existing.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]])
      assert.ok((await existing.query("select elite_create_order('[{\"product_id\":\"a\",\"quantity\":1}]') as result")).rows[0].result.id)
      await apply('006_order_delivery.sql')
      const items = JSON.stringify([{ product_id:'a', quantity:2 }])
      assert.ok((await existing.query('select elite_create_order($1::jsonb,$2::jsonb) as result',[items,JSON.stringify(delivery)])).rows[0].result.id)
      const tables = ['public.products','public.orders','public.order_items','public.order_delivery','auth.users','public.profiles']
      const snapshot = async () => Promise.all(tables.map(table => existing.query(`select to_jsonb(t)::text as row from ${table} t order by to_jsonb(t)::text`).then(r => r.rows)))
      const before = await snapshot()
      const originalType = (await existing.query("select format_type(atttypid,atttypmod) as type from pg_attribute where attrelid='products'::regclass and attname='price'")).rows[0].type
      await apply('007_products_price.sql')
      await apply('008_rate_limiting.sql')
      assert.deepEqual(await snapshot(), before)
      assert.equal((await existing.query("select format_type(atttypid,atttypmod) as type from pg_attribute where attrelid='products'::regclass and attname='price'")).rows[0].type,originalType)
      assert.equal((await existing.query("select column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='price'")).rows[0].column_default,null)
      await existing.exec('set role authenticated')
      assert.ok((await existing.query('select elite_create_order($1::jsonb,$2::jsonb) as result',[items,JSON.stringify(delivery)])).rows[0].result.id)
    } finally { await existing.close() }
  })
}

test('007 rejects incompatible existing values atomically without changing their data or default', async () => {
  const existing = new PGlite()
  try {
    await existing.exec('create table products(id text primary key, price numeric default 7)')
    for (const value of [null,'0','-1','1.001','10000000000','NaN','Infinity','-Infinity']) {
      await existing.exec('truncate products')
      await existing.query('insert into products values ($1,$2)', ['a',value])
      const before = (await existing.query('select price::text as price from products')).rows
      await assert.rejects(existing.exec(readFileSync(new URL('../supabase/migrations/007_products_price.sql', import.meta.url),'utf8')))
      await existing.exec('rollback')
      assert.deepEqual((await existing.query('select price::text as price from products')).rows,before)
      assert.equal((await existing.query("select column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='price'")).rows[0].column_default,'7')
    }
  } finally { await existing.close() }
})

test('direct order RPC: 5/10min, independent users, blocked requests do not increment', async () => {
  await asUser(0)
  for (let i=0; i<5; i++) assert.ok((await create()).id)
  assert.equal((await create()).code, 'PT429')
  assert.deepEqual((await counters()).map(c => c.used), [5,5])
  await asUser(1)
  assert.ok((await create()).id)
})

test('invalid business input consumes quota; no partial order survives', async () => {
  await asUser(0)
  assert.equal((await create([])).code, 'PT400')
  assert.deepEqual((await counters()).map(c => c.used), [1,1])
  assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n, 0)
})

test('internal failure AFTER inserts rolls back business but commits quota', async () => {
  await db.exec(`create function public.test_fail_delivery() returns trigger language plpgsql as $$
    begin raise exception 'PRIVATE_SQL_DETAIL'; end; $$;
    create trigger test_delivery before insert on order_delivery for each row execute function public.test_fail_delivery();`)
  try {
    await asUser(0)
    const result = await create()
    assert.equal(result.code, 'PT500')
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SQL_DETAIL'))
    assert.deepEqual((await counters()).map(c => c.used), [1,1])
    for (const table of ['orders','order_items','order_delivery']) assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0)
  } finally { await db.exec('reset role; drop trigger test_delivery on order_delivery; drop function public.test_fail_delivery()') }
})

test('explicit whole-transaction rollback also rolls back quota: documented limitation', async () => {
  await asUser(0)
  await db.exec('begin')
  assert.equal((await create([])).code, 'PT400')
  await db.exec('rollback')
  assert.equal((await counters()).length, 0)
})

test('HTTP status and Retry-After are set without raising/rolling back', async () => {
  await asUser(0)
  for (let i=0; i<5; i++) await create()
  await db.exec('begin')
  const result = await create()
  const settings = (await db.query("select current_setting('response.status') as status, current_setting('response.headers') as headers")).rows[0]
  await db.exec('commit')
  assert.equal(settings.status, '429')
  const seconds = JSON.parse(result.details).retry_after
  assert.ok(seconds >= 1 && seconds <= 600)
  assert.equal(JSON.parse(settings.headers)[0]['Retry-After'], String(seconds))
})

test('hourly quota blocks independently; expired windows reset, cleanup preserves active rows', async () => {
  await asUser(0)
  await create()
  await db.exec('reset role')
  await db.exec("update elite_security.rate_counters set used=20 where period_seconds=3600")
  await asUser(0)
  assert.equal((await create()).code, 'PT429')
  assert.deepEqual((await counters()).map(c => c.used), [1,20])
  await db.exec("update elite_security.rate_counters set window_start=window_start-interval '1 day', expires_at=expires_at-interval '1 day'")
  await asUser(0)
  assert.ok((await create()).id)
  assert.deepEqual((await counters()).map(c => c.used), [1,1])
})

test('checkout: other owner including admin cannot consume order quota; 3/order and 5/user', async () => {
  await asUser(0)
  const first = await create(), second = await create()
  for (const index of [1,2]) {
    await asUser(index)
    assert.equal((await rpc('elite_checkout_quota', [first.id])).code, 'PT404')
  }
  assert.ok((await counters()).every(c => c.action === 'order_create'))
  await asUser(0)
  for (let i=0; i<3; i++) assert.equal((await rpc('elite_checkout_quota', [first.id])).allowed, true)
  assert.equal((await rpc('elite_checkout_quota', [first.id])).code, 'PT429')
  for (let i=0; i<2; i++) assert.equal((await rpc('elite_checkout_quota', [second.id])).allowed, true)
  assert.equal((await rpc('elite_checkout_quota', [second.id])).code, 'PT429')
  assert.equal((await counters()).find(c => c.action === 'checkout_user').used, 5)
})

test('checkout rejects cancelled/invalid historical orders without consuming quota', async () => {
  await asUser(0)
  const order = await create()
  await db.exec('reset role')
  await db.query("update orders set status='cancelled' where id=$1", [order.id])
  await asUser(0)
  assert.equal((await rpc('elite_checkout_quota', [order.id])).code, 'PT409')
  assert.ok((await counters()).every(c => c.action === 'order_create'))
})

test('admin RPC CRUD works, user denied; direct DML and private helpers/counters denied', async () => {
  await asUser(0)
  for (const [name,args] of [['elite_admin_create_product',[JSON.stringify(product)]],['elite_admin_update_product',['a',JSON.stringify(product)]],['elite_admin_delete_product',['a']]]) {
    await assert.rejects(rpc(name,args), { code: 'PT403' })
  }
  for (const index of [0,2]) {
    await asUser(index)
    for (const sql of ["update products set price=1 where id='a'", "delete from products where id='a'", "insert into products select * from products", 'select * from elite_security.rate_counters', 'truncate elite_security.rate_counters', "select elite_security.consume('order_create')", "select elite_security.create_order_006('[]','{}')", "update profiles set role='admin'"]) {
      await assert.rejects(db.exec(sql), { code: '42501' })
    }
  }
  await asUser(2)
  const made = await rpc('elite_admin_create_product', [JSON.stringify(product)])
  assert.ok(made.id)
  assert.equal((await rpc('elite_admin_update_product', [made.id,JSON.stringify({ ...product, price: 12 })])).price, 12)
  assert.deepEqual(await rpc('elite_admin_delete_product', [made.id]), { deleted: made.id })
  await db.exec('reset role; set role anon')
  assert.ok((await db.query('select * from products')).rows.length)
  await assert.rejects(rpc('elite_admin_delete_product',['a']), { code: '42501' })
})

test('admin invalid input consumes quota; combined writes and delete additional budget', async () => {
  await asUser(2)
  assert.equal((await rpc('elite_admin_create_product',[JSON.stringify({ ...product, price: 0 })])).code,'PT400')
  assert.equal((await counters())[0].used, 1)
  await db.exec('update elite_security.rate_counters set used=30')
  await asUser(2)
  assert.equal((await rpc('elite_admin_create_product',[JSON.stringify(product)])).code,'PT429')
  await db.exec('reset role; truncate elite_security.rate_counters')
  await asUser(2)
  for (let i=0; i<10; i++) assert.equal((await rpc('elite_admin_delete_product',['missing'])).code,'PT404')
  assert.equal((await rpc('elite_admin_delete_product',['missing'])).code,'PT429')
  assert.ok((await rpc('elite_admin_create_product',[JSON.stringify(product)])).id)
})

test('read quota is shared between orders/admin and independent of writes', async () => {
  await asUser(2)
  for (let i=0; i<60; i++) assert.equal((await rpc('elite_consume_read_quota',[i%2 ? 'orders':'admin'])).allowed,true)
  assert.equal((await rpc('elite_consume_read_quota',['orders'])).code,'PT429')
  assert.ok((await rpc('elite_admin_create_product',[JSON.stringify(product)])).id)
})

test('burst of simultaneous callers has no over-admission (PGlite serializes connections)', async () => {
  await asUser(0)
  const results = await Promise.all(Array.from({ length: 20 }, () => create()))
  assert.equal(results.filter(r => r.id).length, 5)
  assert.equal(results.filter(r => r.code === 'PT429').length, 15)
  assert.deepEqual((await counters()).map(c => c.used), [5,5])
})

test('all API error adapters preserve safe 429 + Retry-After, reject malformed retry values', async () => {
  const error = { code:'PT429', message:'SECRET_SQL', details:JSON.stringify({ retry_after:42 }) }
  for (const handler of [rateLimitResponse,adminFailure,ordersFailure,checkoutFailure]) {
    const response = handler(error)
    assert.equal(response.status,429)
    assert.equal(response.headers.get('Retry-After'),'42')
    assert.ok(!(await response.text()).includes('SECRET_SQL'))
  }
  for (const value of [0,-1,3601,'30',1.5]) assert.equal(rateLimitResponse({ ...error,details:JSON.stringify({ retry_after:value }) }).headers.get('Retry-After'),null)
  assert.equal(rateLimitResponse({ ...error,details:'bad' }).status,429)
  await assert.rejects(protectedRpc({ rpc:async () => ({ data:error }) },'x',{}),{ code:'PT429' })
  await assert.rejects(consumeReadQuota({ rpc:async () => ({ error }) },'orders'),{ code:'PT429' })
})

test('checkout does not call provider on blocked/unavailable quota; provider failure consumes quota first', async () => {
  const id = '44444444-4444-4444-8444-444444444444'
  const order = { id, user_id:users[0], status:'pending', subtotal:10, shipping_cost:0, total:10, order_delivery:{ method:'pickup' }, order_items:[{ product_id:'a',quantity:1,unit_price:10,products:{ name:'Prenda' } }] }
  const events = []
  const query = { select:() => query, eq:() => query, maybeSingle:async () => ({ data:order }) }
  let rpcResult = { error:{ code:'PT429',details:'{"retry_after":10}' } }
  const client = { auth:{ getUser:async () => ({ data:{ user:{ id:users[0] } } }) },from:() => query,rpc:async () => { events.push('quota'); return rpcResult } }
  const request = () => new Request('http://localhost:3000/api/v1/checkout',{ method:'POST',headers:{ Origin:'http://localhost:3000','Content-Type':'application/json' },body:JSON.stringify({ order_id:id }) })
  const options = { appUrl:'https://8.8.8.8',token:'test-only',fetch:async () => { events.push('provider'); throw new Error('provider fail') } }
  await assert.rejects(createCheckout(request(),client,options),{ code:'PT429' })
  assert.deepEqual(events,['quota'])
  rpcResult = { error:{ code:'PGRST202' } }
  await assert.rejects(createCheckout(request(),client,options),{ code:'PGRST202' })
  assert.deepEqual(events,['quota','quota'])
  rpcResult = { data:{ allowed:true } }
  await assert.rejects(createCheckout(request(),client,options),{ status:502 })
  assert.deepEqual(events,['quota','quota','quota','provider'])
})
