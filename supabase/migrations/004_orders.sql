-- Ejecutar manualmente después de las migraciones 001, 002 y 003.
-- Esta etapa habilita únicamente lectura desde la aplicación.
begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  total numeric(12,2) not null
    check (total >= 0 and total <> 'NaN'::numeric and total <> 'Infinity'::numeric),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null
    check (unit_price > 0 and unit_price <> 'NaN'::numeric and unit_price <> 'Infinity'::numeric)
);

-- Los CHECK excluyen explícitamente NaN e Infinity; sus límites inferiores
-- excluyen -Infinity. No verifican el origen del precio ni la suma.
-- unit_price conservará el precio histórico al crear el pedido.
comment on column public.order_items.product_id is
  'ON DELETE RESTRICT impide eliminar físicamente productos con historial de pedidos, incluso desde /admin. En una etapa posterior se prevé evaluar una estrategia de producto activo/inactivo.';

create index orders_user_created_at_idx
  on public.orders (user_id, created_at);
create index order_items_order_id_idx
  on public.order_items (order_id);
create index order_items_product_id_idx
  on public.order_items (product_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Se eliminan también los permisos que pudiera otorgar la configuración
-- predeterminada del esquema al crear tablas.
revoke all on table public.orders, public.order_items
  from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.orders, public.order_items to authenticated;

create policy orders_read_own_or_admin
  on public.orders for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- La consulta de orders aplica su propia RLS: solo encuentra pedidos del
-- usuario autenticado, o cualquier pedido si su perfil actual es admin.
create policy order_items_read_visible_order
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
    )
  );

-- Sin permisos ni políticas INSERT/UPDATE/DELETE para clientes, incluidos
-- administradores de la aplicación. No se crea ningún endpoint ni RPC.
-- En una etapa posterior, una operación segura y transaccional deberá obtener
-- user_id de la identidad verificada, leer products.price, copiarlo a unit_price,
-- calcular total y controlar status. Nunca aceptará esos valores del navegador.
commit;
