-- PROPUESTA PARA REVISION. No ejecutar con la aplicacion de la etapa 006.
-- Ejecutar manualmente como postgres, despues de 001..006 y de adaptar Next.
-- Esta migracion no contiene secretos, no consulta APIs y no crea Preferences.
-- El endpoint de Checkout DEBE usar elite_checkout_order antes de llamar a MP;
-- una migracion no puede impedir llamadas externas hechas por codigo antiguo.
begin;

do $$ begin
  if current_user <> 'postgres' then
    raise exception 'Ejecutar esta migracion como postgres.';
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null then
    raise exception 'pgcrypto debe proveer extensions.hmac(bytea,bytea,text). Revisar su instalacion sin mover extensiones automaticamente.';
  end if;
end $$;

-- No se modifican importes, estados, destinatarios ni items historicos.
alter table public.orders
  add column currency text not null default 'ARS' check (currency = 'ARS'),
  add column pricing_version text not null default 'legacy_ars'
    check (pricing_version in ('legacy_ars', 'usd_mep_v1')),
  add column fx_rate numeric(18,6),
  add column fx_source text,
  add column fx_date timestamptz,
  add column fx_fetched_at timestamptz,
  add constraint orders_fx_snapshot check (
    (pricing_version = 'legacy_ars'
      and num_nonnulls(fx_rate, fx_source, fx_date, fx_fetched_at) = 0)
    or (pricing_version = 'usd_mep_v1'
      and num_nonnulls(fx_rate, fx_source, fx_date, fx_fetched_at) = 4
      and fx_rate > 0 and fx_rate < 'Infinity'::numeric
      and fx_source = 'dolarapi_mep_venta'
      and isfinite(fx_date) and isfinite(fx_fetched_at)
      and fx_date <= fx_fetched_at)
  );
alter table public.orders alter column pricing_version set default 'usd_mep_v1';
alter table public.order_items add column unit_price_usd numeric(12,2)
  check (unit_price_usd is null or (unit_price_usd > 0 and unit_price_usd < 'Infinity'::numeric));
comment on column public.products.price is 'Precio base USD desde la etapa 007; no se convierten sus valores existentes.';
comment on column public.order_items.unit_price is 'Precio unitario historico ARS utilizado para cobrar.';
comment on column public.order_items.unit_price_usd is 'Snapshot USD; NULL en pedidos legacy_ars, sin inventar conversiones historicas.';
comment on column public.delivery_options.cost is 'Costo de entrega en ARS, independiente del selector visual USD/ARS.';

create table public.exchange_rates (
  source text primary key check (source = 'dolarapi_mep_venta'),
  rate numeric(18,6) not null check (rate > 0 and rate < 'Infinity'::numeric),
  source_date timestamptz not null check (isfinite(source_date)),
  fetched_at timestamptz not null check (isfinite(fetched_at)),
  check (source_date <= fetched_at)
);
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from public, anon, authenticated;
grant select on public.exchange_rates to anon, authenticated;
create policy exchange_rates_read on public.exchange_rates
  for select to anon, authenticated using (true);
-- Lectura de datos vencidos permitida para mostrarlos como referencia.
-- La RPC de pedidos exige fetched_at de hace MENOS de 24 horas.

create schema elite_private authorization postgres;
revoke all on schema elite_private from public, anon, authenticated;
create table elite_private.signing_secret (
  id boolean primary key default true check (id),
  secret_hex text not null check (secret_hex ~ '^[0-9a-f]{64}$')
);
create table elite_private.used_delivery_authorizations (
  jti uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz not null default clock_timestamp()
);
alter table elite_private.signing_secret enable row level security;
alter table elite_private.used_delivery_authorizations enable row level security;
revoke all on all tables in schema elite_private from public, anon, authenticated;
-- Sin politicas ni permisos para clientes, incluidos admins de la aplicacion.
-- La tabla del secreto queda VACIA. Configurar manualmente fuera del repositorio.

alter table public.order_delivery
  add column geo_provider text,
  add column geo_province_id text,
  add column geo_department_id text,
  add column geo_locality_id text,
  add column geo_street_id text,
  add column geo_validated_at timestamptz,
  add constraint order_delivery_geo_snapshot check (
    num_nonnulls(geo_provider, geo_province_id, geo_department_id,
      geo_locality_id, geo_street_id, geo_validated_at) = 0
    or (method = 'shipping'
      and num_nonnulls(geo_provider, geo_province_id, geo_department_id,
        geo_locality_id, geo_street_id, geo_validated_at) = 6
      and geo_provider = 'georef_amba_v1'
      and geo_province_id in ('02', '06')
      and geo_department_id ~ '^[0-9]{5}$'
      and left(geo_department_id, 2) = geo_province_id
      and geo_locality_id ~ '^[0-9]{1,20}$'
      and geo_street_id ~ '^[0-9]{1,30}$'
      and isfinite(geo_validated_at))
  );

-- Protocolo HMAC-SHA256:
-- key = los 32 bytes decodificados de DELIVERY_SIGNING_SECRET (64 hex minuscula).
-- message = UTF8('elite-club/v1/' + purpose + '\n' + payload_text).
-- signature = 64 caracteres hex minuscula. Firmar/enviar EXACTAMENTE el mismo
-- texto JSON, sin reserializarlo. purpose se fija en cada RPC, no en el navegador.
-- iat/exp son segundos Unix enteros. No persistir ni registrar payloads/firmas.
create function elite_private.verify_signature(p_payload text, p_signature text, p_purpose text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_secret text; v_expected bytea; v_received bytea; v_diff integer := 0;
  v_claims jsonb; v_iat bigint; v_exp bigint;
  v_now numeric := extract(epoch from clock_timestamp());
  v_ttl integer := case p_purpose when 'exchange_rate_v1' then 120 when 'amba_delivery_v1' then 900 else 0 end;
begin
  if v_ttl = 0 or p_payload is null or octet_length(p_payload) > 20000
    or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT403', message = 'Autorizacion invalida.';
  end if;
  select secret_hex into v_secret from elite_private.signing_secret where id;
  if not found then
    raise exception using errcode = 'PT503', message = 'Falta configurar el secreto de firma.';
  end if;
  v_expected := extensions.hmac(convert_to('elite-club/v1/' || p_purpose || chr(10) || p_payload, 'UTF8'), decode(v_secret, 'hex'), 'sha256');
  v_received := decode(p_signature, 'hex');
  -- Recorre todos los bytes; no corta en el primer byte distinto.
  for i in 0..31 loop
    v_diff := v_diff | (get_byte(v_expected, i) # get_byte(v_received, i));
  end loop;
  if v_diff <> 0 then
    raise exception using errcode = 'PT403', message = 'Autorizacion invalida.';
  end if;
  begin
    v_claims := p_payload::jsonb;
    if jsonb_typeof(v_claims) is distinct from 'object'
      or jsonb_typeof(v_claims -> 'iat') is distinct from 'number'
      or jsonb_typeof(v_claims -> 'exp') is distinct from 'number'
      or (v_claims ->> 'iat') !~ '^[0-9]{1,12}$'
      or (v_claims ->> 'exp') !~ '^[0-9]{1,12}$' then
      raise exception 'Invalid claims';
    end if;
    v_iat := (v_claims ->> 'iat')::bigint;
    v_exp := (v_claims ->> 'exp')::bigint;
  exception when others then
    raise exception using errcode = 'PT403', message = 'Autorizacion invalida.';
  end;
  if v_iat > v_now or v_exp <= v_now or v_exp <= v_iat or v_exp - v_iat > v_ttl then
    raise exception using errcode = 'PT403', message = 'Autorizacion vencida o invalida.';
  end if;
  return v_claims;
end;
$$;
revoke all on function elite_private.verify_signature(text, text, text) from public, anon, authenticated;

-- Solo Next firma tras un GET exitoso y validado a DolarAPI.
-- Payload: {iat, exp, source, rate, fx_date, fetched_at}.
-- rate es string decimal, fx_date es ISO 8601 UTC terminado en Z;
-- fetched_at es segundo Unix de la consulta REAL, no de un reintento de escritura.
create function public.elite_store_exchange_rate(p_payload text, p_signature text)
returns public.exchange_rates language plpgsql security definer
set search_path = '' set lock_timeout = '5s'
as $$
declare
  v_claims jsonb; v_rate numeric; v_date timestamptz; v_fetched timestamptz;
  v_result public.exchange_rates%rowtype;
begin
  v_claims := elite_private.verify_signature(p_payload, p_signature, 'exchange_rate_v1');
  if (v_claims - array['iat','exp','source','rate','fx_date','fetched_at']) <> '{}'::jsonb
    or (v_claims ->> 'source') is distinct from 'dolarapi_mep_venta'
    or jsonb_typeof(v_claims -> 'rate') is distinct from 'string'
    or coalesce(v_claims ->> 'rate', '') !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$'
    or jsonb_typeof(v_claims -> 'fx_date') is distinct from 'string'
    or coalesce(v_claims ->> 'fx_date', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
    or jsonb_typeof(v_claims -> 'fetched_at') is distinct from 'number'
    or coalesce(v_claims ->> 'fetched_at', '') !~ '^[0-9]{1,12}$' then
    raise exception using errcode = 'PT400', message = 'Cotizacion firmada invalida.';
  end if;
  v_rate := (v_claims ->> 'rate')::numeric;
  v_date := (v_claims ->> 'fx_date')::timestamptz;
  v_fetched := to_timestamp((v_claims ->> 'fetched_at')::bigint);
  if v_rate <= 0 or v_rate >= 'Infinity'::numeric or not isfinite(v_date)
    or v_date > v_fetched
    or (v_claims ->> 'fetched_at')::bigint > (v_claims ->> 'iat')::bigint
    or (v_claims ->> 'iat')::bigint - (v_claims ->> 'fetched_at')::bigint > 120 then
    raise exception using errcode = 'PT400', message = 'Cotizacion o fechas invalidas.';
  end if;
  insert into public.exchange_rates as previous(source, rate, source_date, fetched_at)
    values ('dolarapi_mep_venta', v_rate, v_date, v_fetched)
    on conflict (source) do update
      set rate = excluded.rate, source_date = excluded.source_date, fetched_at = excluded.fetched_at
      where excluded.fetched_at > previous.fetched_at
        and excluded.source_date >= previous.source_date
        and (excluded.source_date > previous.source_date or excluded.rate = previous.rate)
    returning * into v_result;
  if not found then
    -- Un replay no renueva fetched_at. Misma fecha con distinto valor se rechaza.
    raise exception using errcode = 'PT409', message = 'Actualizacion repetida, anterior o inconsistente.';
  end if;
  return v_result;
end;
$$;
revoke all on function public.elite_store_exchange_rate(text, text) from public, anon, authenticated;
-- Puede llamarlo el servidor aun sin usuario conectado, pero SIEMPRE con HMAC.
grant execute on function public.elite_store_exchange_rate(text, text) to anon, authenticated;

-- Retirar TODAS las firmas antiguas: no dejar un camino sin FX ni AMBA.
drop function if exists public.elite_create_order(jsonb);
drop function public.elite_create_order(jsonb, jsonb);

-- Payload AMBA: {iat, exp, sub, jti, delivery, territory}.
-- delivery contiene la entrega NORMALIZADA completa: contactos, direccion,
-- piso/CP/indicaciones incluidos. Next muestra esa direccion para confirmar.
-- territory: {province_id, department_id, locality_id, street_id} de Georef.
-- Next firma solo tras validar su allowlist AMBA; iat=validacion y exp<=iat+900.
-- Cambiar cualquier campo exige otra validacion. Pickup envia ambos textos NULL.
create function public.elite_create_order(p_items jsonb, p_delivery jsonb, p_address_payload text, p_address_signature text)
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
  v_price_usd numeric;
  v_fx public.exchange_rates%rowtype;
  v_claims jsonb;
  v_territory jsonb;
  v_jti uuid;
  v_used uuid;
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

  if p_delivery ->> 'method' = 'shipping' then
    v_claims := elite_private.verify_signature(p_address_payload, p_address_signature, 'amba_delivery_v1');
    if (v_claims - array['iat','exp','sub','jti','delivery','territory']) <> '{}'::jsonb
      or (v_claims ->> 'sub') is distinct from v_user_id::text
      or (v_claims -> 'delivery') is distinct from p_delivery
      or jsonb_typeof(v_claims -> 'jti') is distinct from 'string'
      or coalesce(v_claims ->> 'jti', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_claims -> 'territory') is distinct from 'object' then
      raise exception using errcode = 'PT403', message = 'La autorizacion no corresponde al usuario o la entrega.';
    end if;
    v_jti := (v_claims ->> 'jti')::uuid;
    v_territory := v_claims -> 'territory';
    if (v_territory - array['province_id','department_id','locality_id','street_id']) <> '{}'::jsonb
      or coalesce(v_territory ->> 'province_id', '') not in ('02', '06')
      or coalesce(v_territory ->> 'department_id', '') !~ '^[0-9]{5}$'
      or left(v_territory ->> 'department_id', 2) <> v_territory ->> 'province_id'
      or coalesce(v_territory ->> 'locality_id', '') !~ '^[0-9]{1,20}$'
      or coalesce(v_territory ->> 'street_id', '') !~ '^[0-9]{1,30}$' then
      raise exception using errcode = 'PT403', message = 'Identificadores territoriales invalidos.';
    end if;
    -- La allowlist AMBA la verifica Next con Georef antes de firmar.
    -- El HMAC autentica los IDs y TODA la entrega, no un booleano del cliente.
  elsif p_address_payload is not null or p_address_signature is not null then
    raise exception using errcode = 'PT400', message = 'Retiro no utiliza autorizacion geografica.';
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

  select * into v_fx from public.exchange_rates
    where source = 'dolarapi_mep_venta' for share;
  if not found then
    raise exception using errcode = 'PT503', message = 'No hay cotizacion MEP disponible.';
  end if;
  if v_fx.fetched_at > clock_timestamp()
    or v_fx.fetched_at <= clock_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT503', message = 'Es necesario actualizar la cotizacion MEP.';
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
    v_price_usd := v_price;
    v_price := round(v_price_usd * v_fx.rate, 2);
    if v_price <= 0 or v_price > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'Precio ARS fuera del rango permitido.';
    end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    if v_subtotal + v_option.cost > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'El total supera el importe permitido.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', v_quantity::integer, 'unit_price', v_price, 'unit_price_usd', v_price_usd));
  end loop;

  v_total := v_subtotal + v_option.cost;
  if v_fx.fetched_at <= clock_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT503', message = 'La cotizacion vencio durante la operacion.';
  end if;
  insert into public.orders(user_id, status, currency, pricing_version,
    subtotal, shipping_cost, total, fx_rate, fx_source, fx_date, fx_fetched_at)
    values (v_user_id, 'pending', 'ARS', 'usd_mep_v1', v_subtotal, v_option.cost,
      v_total, v_fx.rate, v_fx.source, v_fx.source_date, v_fx.fetched_at)
    returning * into v_order;
  insert into public.order_items(order_id, product_id, quantity, unit_price, unit_price_usd)
    select v_order.id, i.product_id, i.quantity, i.unit_price, i.unit_price_usd
    from jsonb_to_recordset(v_items) as i(product_id text, quantity integer, unit_price numeric, unit_price_usd numeric);
  insert into public.order_delivery(
    order_id, method, first_name, last_name, phone, street, street_number,
    apartment, postal_code, city, province, instructions,
    pickup_name, pickup_address, pickup_hours, pickup_contact,
    geo_provider, geo_province_id, geo_department_id, geo_locality_id, geo_street_id, geo_validated_at
  ) values (
    v_order.id, v_delivery.method, v_delivery.first_name, v_delivery.last_name,
    v_delivery.phone, v_delivery.street, v_delivery.street_number,
    v_delivery.apartment, v_delivery.postal_code, v_delivery.city,
    v_delivery.province, v_delivery.instructions,
    v_option.pickup_name, v_option.pickup_address, v_option.pickup_hours, v_option.pickup_contact,
    case when v_jti is not null then 'georef_amba_v1' end,
    v_territory ->> 'province_id', v_territory ->> 'department_id',
    v_territory ->> 'locality_id', v_territory ->> 'street_id',
    case when v_jti is not null then to_timestamp((v_claims ->> 'iat')::bigint) end
  ) returning * into v_delivery;

  if v_jti is not null then
    if (v_claims ->> 'exp')::bigint <= extract(epoch from clock_timestamp()) then
      raise exception using errcode = 'PT403', message = 'La autorizacion de entrega vencio.';
    end if;
    insert into elite_private.used_delivery_authorizations(jti, user_id, order_id, expires_at)
      values (v_jti, v_user_id, v_order.id, to_timestamp((v_claims ->> 'exp')::bigint))
      on conflict (jti) do nothing returning jti into v_used;
    if not found then
      raise exception using errcode = 'PT409', message = 'La autorizacion de entrega ya fue utilizada.';
    end if;
    -- UNIQUE garantiza un solo uso incluso con llamadas simultaneas.
    -- Cualquier fallo revierte consumo, pedido, items y entrega juntos.
  end if;

  -- Verifica los importes contra los ítems efectivamente almacenados.
  if exists (select 1 from public.order_items where order_id = v_order.id
      and (unit_price_usd is null or unit_price <> round(unit_price_usd * v_order.fx_rate, 2)))
    or v_order.subtotal <> (select sum(quantity * unit_price)
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

revoke all on function public.elite_create_order(jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.elite_create_order(jsonb, jsonb, text, text) to authenticated;

-- Contrato para el futuro POST /api/v1/checkout. No crea Preferences ni cambia
-- estados. Next debe usar esta RPC y rechazar legacy_ars tambien en su codigo.
-- Leer orders con SELECT sigue permitido para consultar el historial.
create function public.elite_checkout_order(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' set lock_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_delivery public.order_delivery%rowtype;
  v_sum numeric;
  v_count bigint;
begin
  if v_user_id is null or not exists (select 1 from auth.users where id = v_user_id) then
    raise exception using errcode = 'PT401', message = 'Unauthorized';
  end if;
  select * into v_order from public.orders
    where id = p_order_id and user_id = v_user_id for share;
  if not found then
    raise exception using errcode = 'PT404', message = 'Pedido no encontrado.';
  end if;
  if v_order.pricing_version <> 'usd_mep_v1' or v_order.currency <> 'ARS'
    or v_order.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'Solo pueden pagarse pedidos pending usd_mep_v1 en ARS. Los legacy requieren un pedido nuevo.';
  end if;
  select * into v_delivery from public.order_delivery where order_id = v_order.id;
  if not found then
    raise exception using errcode = 'PT409', message = 'Falta la entrega del pedido.';
  end if;
  if (v_delivery.method = 'pickup' and v_order.shipping_cost <> 0)
    or (v_delivery.method = 'shipping' and (
      v_delivery.geo_provider is distinct from 'georef_amba_v1'
      or not exists (select 1 from elite_private.used_delivery_authorizations a
        where a.order_id = v_order.id and a.user_id = v_user_id))) then
    raise exception using errcode = 'PT409', message = 'Entrega no autorizada.';
  end if;
  select count(*), sum(quantity * unit_price) into v_count, v_sum
    from public.order_items where order_id = v_order.id;
  if v_count = 0 or v_sum is distinct from v_order.subtotal
    or v_order.total <> v_order.subtotal + v_order.shipping_cost
    or exists (select 1 from public.order_items where order_id = v_order.id
      and (unit_price_usd is null or unit_price <> round(unit_price_usd * v_order.fx_rate, 2))) then
    raise exception using errcode = 'PT409', message = 'Importes del pedido inconsistentes.';
  end if;
  -- No exige cotizacion vigente al PAGAR: conserva la snapshot ya contratada.
  return to_jsonb(v_order) || jsonb_build_object(
    'order_delivery', to_jsonb(v_delivery),
    'order_items', (select jsonb_agg(to_jsonb(i) || jsonb_build_object(
      'products', jsonb_build_object('name', p.name)) order by i.product_id)
      from public.order_items i join public.products p on p.id = i.product_id
      where i.order_id = v_order.id));
end;
$$;
revoke all on function public.elite_checkout_order(uuid) from public, anon, authenticated;
grant execute on function public.elite_checkout_order(uuid) to authenticated;

-- Configuracion MANUAL posterior, nunca incluir el valor real en archivos:
-- 1. Generar 32 bytes aleatorios y representarlos como 64 hex en minuscula.
-- 2. Next: DELIVERY_SIGNING_SECRET=<valor privado>, sin NEXT_PUBLIC_.
-- 3. Como postgres: insertar ese mismo valor en
--    elite_private.signing_secret(id, secret_hex) con id=true.
-- No exponer elite_private en Data API ni conceder USAGE/SELECT a clientes.
-- No crear una RPC para leer o configurar el secreto.
-- Rotar: sustituir ambas copias coordinadamente; invalida firmas pendientes.
-- Next debe mantener la allowlist AMBA, consultar Georef/DolarAPI y firmar.
-- SQL no llama APIs externas y no puede comprobar por si solo una consulta HTTP.
-- Hasta adaptar Next, configurar el secreto y obtener una cotizacion firmada,
-- el nuevo flujo NO debe habilitarse. No reejecutar 005/006 despues de 007.
-- Sin service_role, webhook, stock, pagos de produccion ni despliegues.
commit;
