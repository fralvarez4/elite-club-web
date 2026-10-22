-- Ejecutar manualmente como postgres, después de 004_orders.sql.
-- products.price debe existir. No otorga escritura directa sobre las tablas.
begin;

create or replace function public.elite_create_order(p_items jsonb)
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
  v_total numeric := 0;
  v_seen text[] := array[]::text[];
  v_items jsonb := '[]'::jsonb;
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  if v_user_id is null or not exists (select 1 from auth.users where id = v_user_id) then
    raise exception using errcode = 'PT401', message = 'Unauthorized';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'PT400', message = 'items debe ser un arreglo.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 or octet_length(p_items::text) > 16384 then
    raise exception using errcode = 'PT400', message = 'El pedido debe contener entre 1 y 100 ítems.';
  end if;

  -- Orden estable de bloqueo para reducir conflictos entre pedidos simultáneos.
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
    if length(trim(v_product_id)) = 0 or length(v_product_id) > 200
      or v_quantity < 1 or v_quantity > 99 or v_quantity <> trunc(v_quantity) then
      raise exception using errcode = 'PT400', message = 'Producto o cantidad inválidos: quantity debe ser un entero entre 1 y 99.';
    end if;
    if v_product_id = any(v_seen) then
      raise exception using errcode = 'PT400', message = 'No repitas product_id; indicá su cantidad en un solo ítem.';
    end if;
    v_seen := array_append(v_seen, v_product_id);

    -- Mantiene el precio estable y evita eliminar el producto durante la creación.
    select p.price into v_price from public.products p
      where p.id = v_product_id for share;
    if not found then
      raise exception using errcode = 'PT400', message = 'Uno de los productos no existe.';
    end if;
    if v_price is null or v_price <= 0 or v_price >= 'Infinity'::numeric
      or v_price > 9999999999.99 or v_price <> round(v_price, 2) then
      raise exception using errcode = 'PT409', message = 'Uno de los productos no tiene un precio válido con hasta dos decimales.';
    end if;
    v_total := v_total + v_price * v_quantity;
    if v_total > 9999999999.99 then
      raise exception using errcode = 'PT409', message = 'El total supera el importe permitido.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', v_quantity::integer, 'unit_price', v_price));
  end loop;

  insert into public.orders(user_id, status, total)
    values (v_user_id, 'pending', v_total) returning * into v_order;
  insert into public.order_items(order_id, product_id, quantity, unit_price)
    select v_order.id, i.product_id, i.quantity, i.unit_price
    from jsonb_to_recordset(v_items) as i(product_id text, quantity integer, unit_price numeric);

  select to_jsonb(v_order) || jsonb_build_object('order_items',
    jsonb_agg(to_jsonb(i) order by i.product_id)) into v_result
    from public.order_items i where i.order_id = v_order.id;
  return v_result;
end;
$$;

-- SECURITY DEFINER escribe únicamente mediante el flujo validado anterior.
-- Una llamada directa a la RPC sigue teniendo las mismas validaciones.
revoke all on function public.elite_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.elite_create_order(jsonb) to authenticated;
-- Se conservan RLS y los permisos SELECT de 004; no se concede INSERT/UPDATE/DELETE.
commit;
