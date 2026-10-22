import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// PostgreSQL local en memoria. auth.users/auth.uid son fixtures; no accede al proyecto remoto.
const migration = readFileSync(new URL('../supabase/migrations/002_profiles.sql', import.meta.url), 'utf8')
const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
let db
test.setTimeout(60000)
test.beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${first}', '{"first_name":"Ana","last_name":"Pérez","birth_date":"2000-02-29"}');
  `)
  await db.exec(migration)
  await db.query('insert into auth.users values ($1, $2)', [second, { given_name: '  Juan  ', family_name: 'García', birth_date: '2001-02-30', role: 'admin', id: 999 }])
})
test.afterAll(async () => { await db?.close() })
test.afterEach(async () => { await db.exec('reset role') })

test('trigger and backfill create profiles, sanitize metadata and never trust metadata.role', async () => {
  const { rows } = await db.query('select user_id, first_name, last_name, birth_date::text, role from public.profiles order by id')
  expect(rows).toEqual([
    { user_id: first, first_name: 'Ana', last_name: 'Pérez', birth_date: '2000-02-29', role: 'user' },
    { user_id: second, first_name: 'Juan', last_name: 'García', birth_date: null, role: 'user' },
  ])
  for (const metadata of [null, {}, { first_name: {}, last_name: [], birth_date: '2999-01-01' }, { birth_date: '0000-01-01' }]) {
    const id = crypto.randomUUID()
    await db.query('insert into auth.users values ($1, $2)', [id, metadata])
    const result = await db.query('select first_name, last_name, birth_date, role from public.profiles where user_id = $1', [id])
    expect(result.rows).toEqual([{ first_name: null, last_name: null, birth_date: null, role: 'user' }])
  }
})

test('rerunning migration or firing two triggers keeps exactly one profile and stable IDs', async () => {
  const before = (await db.query('select id::text, user_id from public.profiles order by id')).rows
  await db.exec(migration)
  expect((await db.query('select id::text, user_id from public.profiles order by id')).rows).toEqual(before)
  await db.exec('create trigger test_duplicate_event after insert on auth.users for each row execute function public.elite_create_profile()')
  const id = crypto.randomUUID()
  await db.query('insert into auth.users values ($1, $2)', [id, {}])
  expect((await db.query('select count(*)::int as count from public.profiles where user_id = $1', [id])).rows[0].count).toBe(1)
  await db.exec('drop trigger test_duplicate_event on auth.users')
  await expect(db.query('insert into public.profiles(user_id) values ($1)', [id])).rejects.toMatchObject({ code: '23505' })
})

test('authenticated users can only SELECT and UPDATE their own personal fields', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${first}', false)`)
  expect((await db.query('select user_id from public.profiles')).rows).toEqual([{ user_id: first }])
  expect((await db.query('update public.profiles set first_name = $1 where user_id = $2 returning first_name', ['Anita', first])).rows).toEqual([{ first_name: 'Anita' }])
  expect((await db.query('update public.profiles set first_name = $1 where user_id = $2 returning user_id', ['Intruso', second])).rows).toEqual([])
  for (const statement of [
    "update public.profiles set role = 'admin'",
    'update public.profiles set id = default',
    `update public.profiles set user_id = '${second}'`,
    "update public.profiles set created_at = now()",
    `insert into public.profiles(user_id) values ('${first}')`,
    'delete from public.profiles',
    "select public.elite_profile_metadata('{}')",
  ]) await expect(db.exec(statement)).rejects.toMatchObject({ code: '42501' })
  await expect(db.exec("update public.profiles set birth_date = '2999-01-01'")).rejects.toMatchObject({ code: '23514' })
})

test('anonymous users have no profile access and role only allows user/admin', async () => {
  await expect(db.exec("update public.profiles set role = 'owner'")).rejects.toMatchObject({ code: '23514' })
  await db.exec(`update public.profiles set role = 'admin' where user_id = '${second}'`)
  await db.exec(migration)
  expect((await db.query('select role from public.profiles where user_id = $1', [second])).rows[0].role).toBe('admin')
  await db.exec('set role anon')
  for (const statement of ['select * from public.profiles', "update public.profiles set role = 'admin'", 'delete from public.profiles']) {
    await expect(db.exec(statement)).rejects.toMatchObject({ code: '42501' })
  }
})
