-- PROPUESTA PARA REVISION. NO EJECUTAR TODAVIA.
-- Requiere 001..006 y 007_products_price.sql antes de esta migracion.
-- USD/ARS + AMBA es un borrador fuera de esta secuencia: ../drafts/order_currency_amba.sql.
-- Coordinar previamente las APIs con las RPC de este archivo: revoca DML directo.
-- Ejecutar manualmente como postgres; nunca desde el navegador.
begin;

create schema elite_security;
revoke all on schema elite_security from public, anon, authenticated;
alter default privileges in schema elite_security revoke execute on functions from public;

create table elite_security.rate_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_key text not null,
  period_seconds integer not null check (period_seconds > 0),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  used integer not null check (used >= 0),
  primary key (user_id, action, resource_key, period_seconds)
);
create index rate_counters_expiry_idx on elite_security.rate_counters(expires_at);
alter table elite_security.rate_counters enable row level security;
revoke all on elite_security.rate_counters from public, anon, authenticated;

create function elite_security.actor(p_admin boolean default false)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null or not exists (select 1 from auth.users where id = v_id) then
    raise exception using errcode = 'PT401', message = 'Unauthorized';
  end if;
  if p_admin then
    perform 1 from public.profiles where user_id = v_id and role = 'admin' for share;
    if not found then
      raise exception using errcode = 'PT403', message = 'Forbidden';
    end if;
  end if;
  return v_id;
end;
$$;

-- Devuelve HTTP de error SIN RAISE: PostgREST debe confirmar la transaccion.
-- details es texto JSON para que supabase-js conserve retry_after.
create function elite_security.failure(p_status integer, p_retry integer default null)
returns jsonb language plpgsql set search_path = '' as $$
declare v_message text;
begin
  v_message := case p_status
    when 400 then 'Solicitud invalida.' when 401 then 'Unauthorized'
    when 403 then 'Forbidden' when 404 then 'Recurso no encontrado.'
    when 409 then 'Operacion no disponible.'
    when 429 then 'Demasiadas solicitudes. Intenta nuevamente mas tarde.'
    else 'No se pudo completar la operacion.' end;
  perform set_config('response.status', p_status::text, true);
  if p_status = 429 then
    perform set_config('response.headers', jsonb_build_array(
      jsonb_build_object('Retry-After', greatest(1, p_retry)::text))::text, true);
  end if;
  return jsonb_build_object('code', 'PT' || p_status, 'message', v_message,
    'details', case when p_status = 429 then
      jsonb_build_object('retry_after', greatest(1, p_retry))::text else null end,
    'hint', null);
end;
$$;

create function elite_security.business_failure(p_code text)
returns jsonb language sql set search_path = '' as $$
  select elite_security.failure(case
    when p_code in ('PT400','PT401','PT403','PT404','PT409') then substring(p_code from 3)::integer
    when p_code in ('23503','23505') then 409
    when p_code = '55P03' then 503 else 500 end);
$$;

-- Solo se llama desde funciones confiables. Identidad, reloj y reglas del servidor.
-- Cero = permitido; positivo = segundos hasta liberar TODAS las ventanas bloqueadas.
create function elite_security.consume(p_action text, p_resource text default '')
returns integer language plpgsql set search_path = '' as $$
declare
  v_user uuid := elite_security.actor();
  v_rules jsonb;
  v_rule jsonb;
  v_now timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_used integer;
  v_retry integer := 0;
begin
  v_rules := case p_action
    when 'order_create' then '[["order_create",600,5],["order_create",3600,20]]'::jsonb
    when 'checkout' then '[["checkout_user",600,5],["checkout_order",300,3]]'::jsonb
    when 'admin_write' then '[["admin_write",60,30]]'::jsonb
    when 'admin_delete' then '[["admin_write",60,30],["admin_delete",600,10]]'::jsonb
    when 'api_read' then '[["api_read",60,60]]'::jsonb else null end;
  if v_rules is null or (p_action = 'checkout' and nullif(p_resource, '') is null) then
    raise exception 'Invalid private quota rule';
  end if;
  -- Serializa las cuotas del mismo usuario; colisiones de hash solo serializan mas.
  perform pg_advisory_xact_lock(hashtextextended('elite_rate:' || v_user::text, 0));
  v_now := clock_timestamp();
  -- Limpieza acotada e indexada: nunca elimina ventanas activas.
  delete from elite_security.rate_counters where ctid in (
    select ctid from elite_security.rate_counters where expires_at <= v_now
    order by expires_at limit 100 for update skip locked
  );
  for v_rule in select value from jsonb_array_elements(v_rules) loop
    v_start := to_timestamp(floor(extract(epoch from v_now) / (v_rule->>1)::integer)
      * (v_rule->>1)::integer);
    v_end := v_start + make_interval(secs => (v_rule->>1)::integer);
    insert into elite_security.rate_counters as c
      (user_id, action, resource_key, period_seconds, window_start, expires_at, used)
    values (v_user, v_rule->>0, case when v_rule->>0 = 'checkout_order' then p_resource else '' end,
      (v_rule->>1)::integer, v_start, v_end, 0)
    on conflict (user_id, action, resource_key, period_seconds) do update
      set window_start = excluded.window_start, expires_at = excluded.expires_at,
        used = case when c.window_start = excluded.window_start then c.used else 0 end
    returning used into v_used;
    if v_used >= (v_rule->>2)::integer then
      v_retry := greatest(v_retry, ceil(extract(epoch from v_end - v_now))::integer, 1);
    end if;
  end loop;
  if v_retry > 0 then return v_retry; end if;
  -- Todas las reglas pasan antes de incrementar: no consumo parcial.
  for v_rule in select value from jsonb_array_elements(v_rules) loop
    update elite_security.rate_counters set used = used + 1
    where user_id = v_user and action = v_rule->>0
      and resource_key = case when v_rule->>0 = 'checkout_order' then p_resource else '' end
      and period_seconds = (v_rule->>1)::integer;
  end loop;
  return 0;
end;
$$;

-- Conserva INTEGRA la implementacion 006 y oculta la entrada sin cuota.
alter function public.elite_create_order(jsonb, jsonb) set schema elite_security;
alter function elite_security.elite_create_order(jsonb, jsonb) rename to create_order_006;
revoke all on function elite_security.create_order_006(jsonb, jsonb) from public, anon, authenticated;

create function public.elite_create_order(p_items jsonb, p_delivery jsonb)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_retry integer;
begin
  perform elite_security.actor();
  v_retry := elite_security.consume('order_create');
  if v_retry > 0 then return elite_security.failure(429, v_retry); end if;
  -- El contador esta FUERA de esta subtransaccion. El negocio es atomico.
  begin
    return elite_security.create_order_006(p_items, p_delivery);
  exception when others then
    return elite_security.business_failure(SQLSTATE);
  end;
end;
$$;

create function elite_security.mutate_product(p_operation text, p_product jsonb, p_id text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_retry integer;
  v_key text;
  v_product public.products%rowtype;
  v_number numeric;
begin
  perform elite_security.actor(true);
  v_retry := elite_security.consume(case when p_operation = 'delete' then 'admin_delete' else 'admin_write' end);
  if v_retry > 0 then return elite_security.failure(429, v_retry); end if;
  begin
    if p_operation not in ('create','update','delete') or p_operation is null then
      raise exception using errcode = 'PT400';
    end if;
    if p_operation <> 'create' and (nullif(btrim(p_id),'') is null or length(p_id) > 200) then
      raise exception using errcode = 'PT400';
    end if;
    if p_operation <> 'delete' then
      if p_product is null or jsonb_typeof(p_product) <> 'object' or octet_length(p_product::text) > 16000 then
        raise exception using errcode = 'PT400';
      end if;
      if p_product - array['name','size','brand','type','image','sort_order','price'] <> '{}'::jsonb then
        raise exception using errcode = 'PT400';
      end if;
      foreach v_key in array array['name','size','brand','type','image'] loop
        if jsonb_typeof(p_product->v_key) is distinct from 'string'
          or nullif(btrim(p_product->>v_key),'') is null
          or length(p_product->>v_key) > (case when v_key = 'image' then 2000 else 200 end) then
          raise exception using errcode = 'PT400';
        end if;
        p_product := jsonb_set(p_product, array[v_key], to_jsonb(btrim(p_product->>v_key)));
      end loop;
      if p_product->>'image' !~ '^/products/[a-zA-Z0-9_./% -]+$'
        and p_product->>'image' !~ '^https://' then raise exception using errcode = 'PT400'; end if;
      if jsonb_typeof(p_product->'price') is distinct from 'number'
        or jsonb_typeof(p_product->'sort_order') is distinct from 'number' then
        raise exception using errcode = 'PT400';
      end if;
      v_number := (p_product->>'price')::numeric;
      if v_number <= 0 or v_number >= 'Infinity'::numeric then raise exception using errcode = 'PT400'; end if;
      v_number := (p_product->>'sort_order')::numeric;
      if v_number < 0 or v_number > 2147483647 or v_number <> trunc(v_number) then
        raise exception using errcode = 'PT400';
      end if;
      select * into v_product from jsonb_populate_record(null::public.products, p_product);
    end if;
    if p_operation = 'create' then
      insert into public.products(id,name,size,brand,type,image,sort_order,price)
      values (gen_random_uuid()::text,v_product.name,v_product.size,v_product.brand,
        v_product.type,v_product.image,v_product.sort_order,v_product.price) returning * into v_product;
    elsif p_operation = 'update' then
      update public.products set name=v_product.name, size=v_product.size, brand=v_product.brand,
        type=v_product.type, image=v_product.image, sort_order=v_product.sort_order, price=v_product.price
        where id=p_id returning * into v_product;
      if not found then raise exception using errcode = 'PT404'; end if;
    else
      delete from public.products where id=p_id returning * into v_product;
      if not found then raise exception using errcode = 'PT404'; end if;
      return jsonb_build_object('deleted',v_product.id);
    end if;
    return to_jsonb(v_product);
  exception when others then return elite_security.business_failure(SQLSTATE);
  end;
end;
$$;

create function public.elite_admin_create_product(p_product jsonb)
returns jsonb language sql security definer set search_path = '' set lock_timeout = '5s' as $$
  select elite_security.mutate_product('create', p_product, null);
$$;
create function public.elite_admin_update_product(p_id text, p_product jsonb)
returns jsonb language sql security definer set search_path = '' set lock_timeout = '5s' as $$
  select elite_security.mutate_product('update', p_product, p_id);
$$;
create function public.elite_admin_delete_product(p_id text)
returns jsonb language sql security definer set search_path = '' set lock_timeout = '5s' as $$
  select elite_security.mutate_product('delete', null, p_id);
$$;

-- Consumir DESPUES de validar el pedido y ANTES del fetch a Mercado Pago.
-- Esta RPC confirma su propia transaccion antes de llamar al proveedor.
create function public.elite_checkout_quota(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_user uuid; v_order public.orders%rowtype; v_sum numeric; v_method text; v_retry integer;
begin
  v_user := elite_security.actor();
  select * into v_order from public.orders where id=p_order_id and user_id=v_user for share;
  if not found then return elite_security.failure(404); end if;
  select sum(quantity * unit_price) into v_sum from public.order_items where order_id=p_order_id;
  select method into v_method from public.order_delivery where order_id=p_order_id;
  if v_order.status <> 'pending' or v_sum is null or v_sum <> v_order.subtotal
    or v_order.total <> v_order.subtotal + v_order.shipping_cost
    or v_method is null or v_method not in ('shipping','pickup')
    or (v_method = 'pickup' and v_order.shipping_cost <> 0) then
    return elite_security.failure(409);
  end if;
  v_retry := elite_security.consume('checkout', p_order_id::text);
  if v_retry > 0 then return elite_security.failure(429, v_retry); end if;
  return jsonb_build_object('allowed',true);
end;
$$;

create function public.elite_consume_read_quota(p_area text)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_retry integer;
begin
  if p_area is null or p_area not in ('orders','admin') then return elite_security.failure(400); end if;
  perform elite_security.actor(p_area = 'admin');
  v_retry := elite_security.consume('api_read');
  if v_retry > 0 then return elite_security.failure(429, v_retry); end if;
  return jsonb_build_object('allowed',true);
end;
$$;

revoke all on all functions in schema elite_security from public, anon, authenticated;
revoke all on function public.elite_create_order(jsonb,jsonb),
  public.elite_admin_create_product(jsonb), public.elite_admin_update_product(text,jsonb),
  public.elite_admin_delete_product(text), public.elite_checkout_quota(uuid),
  public.elite_consume_read_quota(text) from public, anon, authenticated;
grant execute on function public.elite_create_order(jsonb,jsonb),
  public.elite_admin_create_product(jsonb), public.elite_admin_update_product(text,jsonb),
  public.elite_admin_delete_product(text), public.elite_checkout_quota(uuid),
  public.elite_consume_read_quota(text) to authenticated;

-- Sin DML directo, incluso para admins. Conserva SELECT publico y RLS existente.
revoke insert, update, delete on public.products from public, anon, authenticated;
revoke insert(id,name,size,brand,type,image,sort_order,price),
  update(id,name,size,brand,type,image,sort_order,price) on public.products from public, anon, authenticated;

-- El borrador USD/ARS + AMBA NO ES COMPATIBLE TAL CUAL. Una futura migracion
-- posterior a 008 que reemplace elite_create_order debe conservar
-- consume('order_create') fuera del bloque EXCEPTION que contiene el negocio.
-- Un rollback/cancelacion de TODA la transaccion tambien revierte los contadores.
-- No habilitar Prefer: tx=rollback en PostgREST. No son transacciones autonomas.
commit;
