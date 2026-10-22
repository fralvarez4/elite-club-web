begin;

create table if not exists public.products (
  id text primary key check (length(trim(id)) > 0),
  name text not null check (length(trim(name)) > 0),
  size text not null check (length(trim(size)) > 0),
  brand text not null check (length(trim(brand)) > 0),
  type text not null check (length(trim(type)) > 0),
  image text not null check (length(trim(image)) > 0),
  sort_order integer not null check (sort_order >= 0)
);

create index if not exists products_sort_order_idx on public.products (sort_order, id);
alter table public.products enable row level security;

revoke all on table public.products from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.products to anon, authenticated;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated using (true);

-- No hay políticas ni permisos INSERT, UPDATE o DELETE para la aplicación.
commit;
