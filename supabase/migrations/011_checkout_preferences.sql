-- Ejecutar manualmente como postgres después de 010_payment_webhooks.sql.
-- Una sola Preference de Mercado Pago por pedido. Si su creación queda incierta,
-- el registro 'creating' se conserva hasta reconciliarlo manualmente.
begin;

create table public.checkout_preferences (
  order_id uuid primary key references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  claim_token uuid not null,
  preference_id text unique,
  init_point text,
  created_at timestamptz not null default now(),
  constraint checkout_preference_pair check ((preference_id is null) = (init_point is null))
);
alter table public.checkout_preferences enable row level security;
revoke all on public.checkout_preferences from public, anon, authenticated;

create function public.elite_claim_checkout_preference(p_order_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_order public.orders%rowtype;
  v_pref public.checkout_preferences%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id then raise exception using errcode = 'PT404'; end if;
  if v_order.status <> 'pending' then raise exception using errcode = 'PT409'; end if;
  insert into public.checkout_preferences(order_id, user_id, claim_token)
  values (p_order_id, p_user_id, gen_random_uuid()) on conflict (order_id) do nothing
  returning * into v_pref;
  if found then return jsonb_build_object('state', 'claimed', 'claim_token', v_pref.claim_token); end if;
  select * into v_pref from public.checkout_preferences where order_id = p_order_id for update;
  if v_pref.user_id is distinct from p_user_id then raise exception using errcode = 'PT409'; end if;
  if v_pref.preference_id is not null then
    return jsonb_build_object('state', 'ready', 'preference_id', v_pref.preference_id, 'init_point', v_pref.init_point);
  end if;
  return jsonb_build_object('state', 'creating');
end;
$$;

create function public.elite_finish_checkout_preference(
  p_order_id uuid, p_user_id uuid, p_claim_token uuid,
  p_preference_id text, p_init_point text
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_pref public.checkout_preferences%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if p_preference_id is null or length(p_preference_id) not between 1 and 200
    or p_init_point is null or length(p_init_point) not between 1 and 2000 then
    raise exception using errcode = 'PT400';
  end if;
  select * into v_pref from public.checkout_preferences where order_id = p_order_id for update;
  if not found or v_pref.user_id is distinct from p_user_id or v_pref.claim_token is distinct from p_claim_token
    or v_pref.preference_id is not null then raise exception using errcode = 'PT409'; end if;
  update public.checkout_preferences set preference_id = p_preference_id, init_point = p_init_point
    where order_id = p_order_id;
  return jsonb_build_object('state', 'ready', 'preference_id', p_preference_id, 'init_point', p_init_point);
end;
$$;

create function public.elite_release_checkout_preference(p_order_id uuid, p_user_id uuid, p_claim_token uuid)
returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  delete from public.checkout_preferences where order_id = p_order_id and user_id = p_user_id
    and claim_token = p_claim_token and preference_id is null;
  return found;
end;
$$;

revoke all on function public.elite_claim_checkout_preference(uuid,uuid) from public, anon, authenticated;
revoke all on function public.elite_finish_checkout_preference(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.elite_release_checkout_preference(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.elite_claim_checkout_preference(uuid,uuid) to service_role;
grant execute on function public.elite_finish_checkout_preference(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.elite_release_checkout_preference(uuid,uuid,uuid) to service_role;
commit;
