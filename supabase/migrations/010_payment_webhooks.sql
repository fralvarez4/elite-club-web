-- Ejecutar manualmente como postgres después de 006_order_delivery.sql.
-- El servidor verifica firma y consulta el pago en Mercado Pago antes de esta RPC.
begin;

create table if not exists public.payment_events (
  payment_id text primary key check (payment_id ~ '^[0-9]{1,30}$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider_status text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  collector_id text not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_events_order_idx on public.payment_events(order_id);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from public, anon, authenticated;

create or replace function public.elite_record_payment(
  p_order_id uuid, p_payment_id text, p_status text,
  p_amount numeric, p_currency text, p_collector_id text
) returns text language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  v_order public.orders%rowtype;
  v_existing uuid;
  v_recorded text;
begin
  -- Sólo el backend con service_role puede llamar esta función.
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Forbidden';
  end if;
  if p_payment_id !~ '^[0-9]{1,30}$' or p_status not in
    ('approved', 'pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back')
    or p_amount is null or p_amount <= 0 or p_currency <> 'ARS'
    or p_collector_id !~ '^[0-9]{1,30}$' then
    raise exception using errcode = 'PT400', message = 'Payment data invalid';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.total <> p_amount then
    raise exception using errcode = 'PT409', message = 'Order amount mismatch';
  end if;
  select order_id into v_existing from public.payment_events where payment_id = p_payment_id for update;
  if found and v_existing <> p_order_id then
    raise exception using errcode = 'PT409', message = 'Payment belongs to another order';
  end if;
  insert into public.payment_events(payment_id, order_id, provider_status, amount, currency, collector_id)
  values (p_payment_id, p_order_id, p_status, p_amount, p_currency, p_collector_id)
  on conflict (payment_id) do update set
    provider_status = excluded.provider_status, updated_at = now()
  where public.payment_events.order_id = excluded.order_id
    and public.payment_events.amount = excluded.amount
    and public.payment_events.currency = excluded.currency
    and public.payment_events.collector_id = excluded.collector_id
  returning payment_id into v_recorded;
  if v_recorded is null then
    raise exception using errcode = 'PT409', message = 'Payment snapshot mismatch';
  end if;
  if p_status = 'approved' and v_order.status = 'pending' then
    update public.orders set status = 'approved' where id = p_order_id;
  end if;
  -- Otros estados quedan en el registro. Un pago fallido no impide reintentar.
  -- Un reembolso/contracargo de un pedido aprobado exige revisión humana.
  return (select status from public.orders where id = p_order_id);
end;
$$;
revoke all on function public.elite_record_payment(uuid,text,text,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.elite_record_payment(uuid,text,text,numeric,text,text)
  to service_role;
commit;
