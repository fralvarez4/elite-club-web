-- Ejecutar manualmente DESPUÉS de 001_products.sql y 002_profiles.sql.
begin;
alter table public.products enable row level security;
grant insert, update, delete on public.products to authenticated;

-- El SELECT público existente se conserva. profiles ya permite leer el rol propio.
drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products for insert to authenticated
with check (exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin'));
drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products for update to authenticated
using (exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin'))
with check (exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin'));
drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products for delete to authenticated
using (exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin'));

-- Privilegios por columna: RLS por sí sola no protege la columna role.
revoke update on public.profiles from public, anon, authenticated;
revoke update (id, user_id, first_name, last_name, birth_date, role, created_at)
on public.profiles from public, anon, authenticated;
grant update (first_name, last_name, birth_date) on public.profiles to authenticated;
commit;
