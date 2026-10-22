-- Propuesta: ejecutar manualmente como postgres después de 005_create_order.sql.
-- NO ejecutar hasta adaptar POST /api/v1/orders a p_items + p_delivery.
-- La firma anterior se elimina; no se pueden crear pedidos nuevos sin entrega.
-- Entrar a revisión no llama esta RPC: solo confirmar el pago crea el pedido.
begin;

alter table public.orders
  add column subtotal numeric(12,2),
  add column shipping_cost numeric(12,2);

-- Los pedidos anteriores conservan su importe; no se inventan sus entregas.
update public.orders set subtotal = total, shipping_cost = 0;
alter table public.orders
  alter column subtotal set not null,
  alter column shipping_cost set not null,
  add constraint orders_subtotal_valid check (
    subtotal >= 0 and subtotal <> 'NaN'::numeric and subtotal <> 'Infinity'::numeric),
  add constraint orders_shipping_cost_valid check (
    shipping_cost >= 0 and shipping_cost <> 'NaN'::numeric and shipping_cost <> 'Infinity'::numeric),
  add constraint orders_total_breakdown check (total = subtotal + shipping_cost);

create table public.delivery_options (
  method text primary key check (method in ('shipping', 'pickup')),
  cost numeric(12,2) not null check (
    cost >= 0 and cost <> 'NaN'::numeric and cost <> 'Infinity'::numeric),
  enabled boolean not null default true,
  pickup_name varchar(150),
  pickup_address varchar(300),
  pickup_hours varchar(150),
  pickup_contact varchar(50),
  constraint delivery_options_pickup_free check (method <> 'pickup' or cost = 0),
  constraint delivery_options_details check (
    (method = 'shipping' and num_nonnulls(
      pickup_name, pickup_address, pickup_hours, pickup_contact) = 0)
    or (method = 'pickup'
      and nullif(btrim(pickup_name), '') is not null
      and nullif(btrim(pickup_address), '') is not null
      and nullif(btrim(pickup_hours), '') is not null
      and nullif(btrim(pickup_contact), '') is not null)
  )
);

insert into public.delivery_options(method, cost) values ('shipping', 0);
insert into public.delivery_options(
  method, cost, pickup_name, pickup_address, pickup_hours, pickup_contact
) values (
  'pickup', 0, 'Punto de retiro Elite Club',
  'General Jose Gervasio Artigas 1046', '10:00 a 20:00', '1161406462'
);

create table public.order_delivery (
  order_id uuid primary key references public.orders(id) on delete cascade,
  method text not null check (method in ('shipping', 'pickup')),
  first_name varchar(100) not null check (length(btrim(first_name)) > 0),
  last_name varchar(100) not null check (length(btrim(last_name)) > 0),
  phone varchar(50) not null check (length(btrim(phone)) > 0),
  street varchar(200),
  street_number varchar(30),
  apartment varchar(100),
  postal_code varchar(20),
  city varchar(100),
  province varchar(100),
  instructions varchar(1000),
  pickup_name varchar(150),
  pickup_address varchar(300),
  pickup_hours varchar(150),
  pickup_contact varchar(50),
  created_at timestamptz not null default now(),
  constraint order_delivery_details check (
    (method = 'shipping'
      and nullif(btrim(street), '') is not null
      and nullif(btrim(street_number), '') is not null
      and nullif(btrim(postal_code), '') is not null
      and nullif(btrim(city), '') is not null
      and nullif(btrim(province), '') is not null
      and num_nonnulls(pickup_name, pickup_address, pickup_hours, pickup_contact) = 0)
    or (method = 'pickup'
      and num_nonnulls(street, street_number, apartment, postal_code,
        city, province, instructions) = 0
      and nullif(btrim(pickup_name), '') is not null
      and nullif(btrim(pickup_address), '') is not null
      and nullif(btrim(pickup_hours), '') is not null
      and nullif(btrim(pickup_contact), '') is not null)
  )
);

comment on table public.order_delivery is
  'Snapshot histórico: no depende del perfil ni de cambios en delivery_options. Los pedidos anteriores a 006 pueden no tener entrega.';
-- La PK order_id también sirve de índice para la FK y las consultas por pedido.
alter table public.delivery_options enable row level security;
alter table public.order_delivery enable row level security;
revoke all on table public.delivery_options, public.order_delivery
  from public, anon, authenticated;
grant select on public.delivery_options to anon, authenticated;
grant select on public.order_delivery to authenticated;

create policy delivery_options_read_enabled
  on public.delivery_options for select to anon, authenticated using (enabled);
create policy order_delivery_read_visible_order
  on public.order_delivery for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_delivery.order_id));
-- orders aplica su RLS: propietario o admin. Ningún cliente escribe directamente.

drop function public.elite_create_order(jsonb);

create function public.elite_create_order(p_items jsonb, p_delivery jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product_id text;
  v_quantity numeric;
  v_price numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_seen text[] := array[]::text[];
  v_items jsonb := '[]'::jsonb;
  v_order public.orders%rowtype;
  v_delivery public.order_delivery%rowtype;
  v_option public.delivery_options%rowtype;
  v_field text;
  v_value jsonb;
  v_limit integer;
begin
  if v_user_id is null or not exists (select 1 from auth.users where id = v_user_id) then
    raise exception using errcode = 'PT401', message = 'Unauthorized';
  end if;

  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object'
    or octet_length(p_delivery::text) > 16384 then
    raise exception using errcode = 'PT400', message = 'Entrega inválida.';
  end if;
  if jsonb_typeof(p_delivery -> 'method') is distinct from 'string'
    or (p_delivery ->> 'method') not in ('shipping', 'pickup') then
    raise exception using errcode = 'PT400', message = 'Método de entrega inválido.';
  end if;

  -- Lista estricta: nunca acepta costos, importes ni datos del punto de retiro.
  for v_field, v_value in select key, value from jsonb_each(p_delivery)
  loop
    v_limit := case v_field
      when 'method' then 8 when 'first_name' then 100 when 'last_name' then 100
      when 'phone' then 50 when 'street' then 200 when 'street_number' then 30
      when 'apartment' then 100 when 'postal_code' then 20 when 'city' then 100
      when 'province' then 100 when 'instructions' then 1000 else null end;
    if v_limit is null or jsonb_typeof(v_value) not in ('string', 'null')
      or length(p_delivery ->> v_field) > v_limit then
      raise exception using errcode = 'PT400', message = 'Campo de entrega inválido.';
    end if;
    if p_delivery ->> 'method' = 'pickup'
      and v_field not in ('method', 'first_name', 'last_name', 'phone') then
      raise exception using errcode = 'PT400', message = 'Retiro no acepta dirección del cliente.';
    end if;
    p_delivery := jsonb_set(p_delivery, array[v_field],
      coalesce(to_jsonb(nullif(btrim(p_delivery ->> v_field), '')), 'null'::jsonb));
  end loop;
  select * into v_delivery
    from jsonb_populate_record(null::public.order_delivery, p_delivery);
  if v_delivery.first_name is null or v_delivery.last_name is null or v_delivery.phone is null
    or (v_delivery.method = 'shipping' and num_nonnulls(v_delivery.street,
      v_delivery.street_number, v_delivery.postal_code, v_delivery.city, v_delivery.province) <> 5) then
    raise exception using errcode = 'PT400', message = 'Completá los datos obligatorios de entrega.';
  end if;

  -- Mantiene configuración y tarifa estables durante toda la transacción.
  select * into v_option from public.delivery_options
    where method = v_delivery.method and enabled for share;
  if not found then
    raise exception using errcode = 'PT409', message = 'Método de entrega no disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'items debe ser un arreglo.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 or octet_length(p_items::text) > 16384 then
    raise exception using errcode = 'PT400', message = 'El pedido debe contener entre 1 y 100 ítems.';
  end if;
  -- Bloqueo en orden estable; conserva las validaciones de la migración 005.
  for v_item in select value from jsonb_array_elements(p_items) order by value ->> 'product_id'
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'PT400', message = 'Ítem inválido.';
    end if;
    if (v_item - 'product_id' - 'quantity') <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'quantity') is distinct from 'number' then
      raise exception using errcode = 'PT400', message = 'Cada ítem acepta únicamente product_id y quantity.';
    end if;
    v_product_id := v_item ->> 'product_id';
    v_quantity := (v_item ->> 'quantity')::numeric;
    if length(btrim(v_product_id)) = 0 or length(v_product_id) > 200
      or v_quantity < 1 or v_quantity > 99 or v_quantity <> trunc(v_quantity) then
      raise exception using errcode = 'PT400', message = 'Producto o cantidad inválidos.';
    end if;
    if v_product_id = any(v_seen) then
      raise exception using errcode = 'PT400', message = 'No repitas product_id.';
    end if;
    v_seen := array_append(v_seen, v_product_id);
    select p.price into v_price from public.products p where p.id = v_product_id for share;
    if not found then
      raise exception using errcode = 'PT400', message = 'Uno de los productos no existe.';
    end if;
    if v_price is null or v_price <= 0 or v_price >= 'Infinity'::numeric
      or v_price > 9999999999.99 or v_price <> round(v_price, 2) then
      raise exception using errcode = 'PT409', message = 'Uno de los productos no tiene un precio válido.';
    end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    if v_subtotal + v_option.cost > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'El total supera el importe permitido.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', v_quantity::integer, 'unit_price', v_price));
  end loop;

  v_total := v_subtotal + v_option.cost;
  insert into public.orders(user_id, status, subtotal, shipping_cost, total)
    values (v_user_id, 'pending', v_subtotal, v_option.cost, v_total) returning * into v_order;
  insert into public.order_items(order_id, product_id, quantity, unit_price)
    select v_order.id, i.product_id, i.quantity, i.unit_price
    from jsonb_to_recordset(v_items) as i(product_id text, quantity integer, unit_price numeric);
  insert into public.order_delivery(
    order_id, method, first_name, last_name, phone, street, street_number,
    apartment, postal_code, city, province, instructions,
    pickup_name, pickup_address, pickup_hours, pickup_contact
  ) values (
    v_order.id, v_delivery.method, v_delivery.first_name, v_delivery.last_name,
    v_delivery.phone, v_delivery.street, v_delivery.street_number,
    v_delivery.apartment, v_delivery.postal_code, v_delivery.city,
    v_delivery.province, v_delivery.instructions,
    v_option.pickup_name, v_option.pickup_address, v_option.pickup_hours, v_option.pickup_contact
  ) returning * into v_delivery;

  -- Verifica los importes contra los ítems efectivamente almacenados.
  if v_order.subtotal <> (select sum(quantity * unit_price)
      from public.order_items where order_id = v_order.id)
    or v_order.total <> v_order.subtotal + v_order.shipping_cost then
    raise exception using errcode = 'PT409', message = 'Los importes del pedido no coinciden.';
  end if;
  return to_jsonb(v_order) || jsonb_build_object(
    'order_delivery', to_jsonb(v_delivery),
    'order_items', (select jsonb_agg(to_jsonb(i) order by i.product_id)
      from public.order_items i where i.order_id = v_order.id));
end;
$$;

revoke all on function public.elite_create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.elite_create_order(jsonb, jsonb) to authenticated;
-- No cambia products, sus políticas, ni los permisos de orders/order_items.
-- Sin webhook, cambios de status, stock ni creación de Preferences.
commit;
