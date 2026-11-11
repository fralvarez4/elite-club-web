-- Ejecutar manualmente después de 008_rate_limiting.sql y antes de habilitar Checkout.
-- El catálogo remoto contiene precios base USD; los pedidos nuevos se calculan en ARS.
-- Conserva los pedidos anteriores como legacy_ars y no modifica sus importes.
begin;

alter table public.orders
  add column pricing_version text not null default 'legacy_ars'
    check (pricing_version in ('legacy_ars', 'usd_mep_v1')),
  add column fx_rate numeric(18,6),
  add column fx_source text,
  add column fx_date timestamptz,
  add column fx_fetched_at timestamptz,
  add constraint orders_fx_snapshot check (
    (pricing_version = 'legacy_ars' and num_nonnulls(fx_rate, fx_source, fx_date, fx_fetched_at) = 0)
    or (pricing_version = 'usd_mep_v1' and num_nonnulls(fx_rate, fx_source, fx_date, fx_fetched_at) = 4
      and fx_rate > 0 and fx_source = 'dolarapi_mep_venta' and fx_date <= fx_fetched_at)
  );
alter table public.order_items add column unit_price_usd numeric(12,2)
  check (unit_price_usd is null or (unit_price_usd > 0 and unit_price_usd < 'Infinity'::numeric));
comment on column public.products.price is 'Precio base USD de la lista del comercio. Los pedidos nuevos guardan el importe ARS convertido con una cotización MEP verificada.';
comment on column public.order_items.unit_price is 'Precio unitario ARS histórico utilizado para cobrar.';
comment on column public.order_items.unit_price_usd is 'Precio USD de catálogo al crear el pedido; NULL en pedidos anteriores.';

create table elite_security.exchange_rates (
  source text primary key check (source = 'dolarapi_mep_venta'),
  rate numeric(18,6) not null check (rate > 0 and rate < 1000000),
  updated_at timestamptz not null,
  fetched_at timestamptz not null,
  check (updated_at <= fetched_at)
);
alter table elite_security.exchange_rates enable row level security;
revoke all on elite_security.exchange_rates from public, anon, authenticated;

create function public.elite_store_mep_rate(p_rate numeric, p_updated_at timestamptz, p_fetched_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if p_rate is null or p_rate <= 0 or p_rate >= 1000000 or p_rate >= 'Infinity'::numeric
    or p_updated_at is null or p_fetched_at is null or not isfinite(p_updated_at)
    or not isfinite(p_fetched_at) or p_updated_at > p_fetched_at
    or p_updated_at < p_fetched_at - interval '24 hours'
    or p_fetched_at < clock_timestamp() - interval '2 minutes'
    or p_fetched_at > clock_timestamp() + interval '30 seconds' then
    raise exception using errcode = 'PT400';
  end if;
  insert into elite_security.exchange_rates(source, rate, updated_at, fetched_at)
  values ('dolarapi_mep_venta', p_rate, p_updated_at, p_fetched_at)
  on conflict (source) do update set rate = excluded.rate,
    updated_at = excluded.updated_at, fetched_at = excluded.fetched_at
  where elite_security.exchange_rates.fetched_at <= excluded.fetched_at;
  return true;
end;
$$;
revoke all on function public.elite_store_mep_rate(numeric,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.elite_store_mep_rate(numeric,timestamptz,timestamptz) to service_role;

create function elite_security.create_order_usd(p_items jsonb, p_delivery jsonb)
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
  v_price_usd numeric;
  v_price numeric;
  v_fx elite_security.exchange_rates%rowtype;
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

  select * into v_fx from elite_security.exchange_rates
    where source = 'dolarapi_mep_venta' for share;
  if not found or v_fx.fetched_at < clock_timestamp() - interval '10 minutes'
    or v_fx.updated_at < clock_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT503', message = 'Cotización no disponible.';
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
    select p.price into v_price_usd from public.products p where p.id = v_product_id for share;
    if not found then
      raise exception using errcode = 'PT400', message = 'Uno de los productos no existe.';
    end if;
    if v_price_usd is null or v_price_usd <= 0 or v_price_usd >= 'Infinity'::numeric
      or v_price_usd > 9999999999.99 or v_price_usd <> round(v_price_usd, 2) then
      raise exception using errcode = 'PT409', message = 'Uno de los productos no tiene un precio válido.';
    end if;
    v_price := round(v_price_usd * v_fx.rate, 2);
    if v_price <= 0 or v_price > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'Precio convertido fuera de rango.';
    end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    if v_subtotal + v_option.cost > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'El total supera el importe permitido.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', v_quantity::integer,
      'unit_price', v_price, 'unit_price_usd', v_price_usd));
  end loop;

  v_total := v_subtotal + v_option.cost;
  insert into public.orders(user_id, status, subtotal, shipping_cost, total,
    pricing_version, fx_rate, fx_source, fx_date, fx_fetched_at)
    values (v_user_id, 'pending', v_subtotal, v_option.cost, v_total,
      'usd_mep_v1', v_fx.rate, v_fx.source, v_fx.updated_at, v_fx.fetched_at) returning * into v_order;
  insert into public.order_items(order_id, product_id, quantity, unit_price, unit_price_usd)
    select v_order.id, i.product_id, i.quantity, i.unit_price, i.unit_price_usd
    from jsonb_to_recordset(v_items) as i(product_id text, quantity integer,
      unit_price numeric, unit_price_usd numeric);
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


revoke all on function elite_security.create_order_usd(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.elite_create_order(p_items jsonb, p_delivery jsonb)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_retry integer;
begin
  perform elite_security.actor();
  perform 1 from elite_security.exchange_rates
    where source = 'dolarapi_mep_venta' and fetched_at >= clock_timestamp() - interval '10 minutes'
      and updated_at >= clock_timestamp() - interval '24 hours';
  if not found then return elite_security.failure(503); end if;
  v_retry := elite_security.consume('order_create');
  if v_retry > 0 then return elite_security.failure(429, v_retry); end if;
  -- El contador esta FUERA de esta subtransaccion. El negocio es atomico.
  begin
    return elite_security.create_order_usd(p_items, p_delivery);
  exception when others then
    return elite_security.business_failure(SQLSTATE);
  end;
end;
$$;


commit;
