-- Ejecutar como postgres desde SQL Editor. No requiere ninguna clave administrativa en la app.
begin;

create table if not exists public.profiles (
  id bigint generated always as identity primary key,
  user_id uuid unique not null references auth.users(id) on delete cascade,
  first_name text check (first_name is null or (length(trim(first_name)) between 1 and 100)),
  last_name text check (last_name is null or (length(trim(last_name)) between 1 and 100)),
  birth_date date check (birth_date is null or (birth_date >= date '0001-01-01' and birth_date <= current_date)),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Solo interpreta datos descriptivos. Nunca toma role, user_id o id de metadata.
create or replace function public.elite_profile_metadata(meta jsonb)
returns table(first_name text, last_name text, birth_date date)
language plpgsql set search_path = '' as $$
declare raw_date text;
begin
  first_name := coalesce(
    case when jsonb_typeof(meta -> 'first_name') = 'string' then nullif(trim(meta ->> 'first_name'), '') end,
    case when jsonb_typeof(meta -> 'given_name') = 'string' then nullif(trim(meta ->> 'given_name'), '') end);
  last_name := coalesce(
    case when jsonb_typeof(meta -> 'last_name') = 'string' then nullif(trim(meta ->> 'last_name'), '') end,
    case when jsonb_typeof(meta -> 'family_name') = 'string' then nullif(trim(meta ->> 'family_name'), '') end);
  if length(first_name) > 100 then first_name := null; end if;
  if length(last_name) > 100 then last_name := null; end if;
  if jsonb_typeof(meta -> 'birth_date') = 'string' then raw_date := meta ->> 'birth_date'; end if;
  if raw_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      birth_date := raw_date::date;
      if birth_date < date '0001-01-01' or birth_date > current_date then birth_date := null; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      birth_date := null;
    end;
  end if;
  return next;
end;
$$;

create or replace function public.elite_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, first_name, last_name, birth_date, role)
  select new.id, m.first_name, m.last_name, m.birth_date, 'user'
  from public.elite_profile_metadata(new.raw_user_meta_data) m
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.elite_profile_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.elite_create_profile() from public, anon, authenticated;

drop trigger if exists elite_profile_after_signup on auth.users;
create trigger elite_profile_after_signup after insert on auth.users
  for each row execute function public.elite_create_profile();

-- Incluye las cuentas previas a esta migración sin reemplazar perfiles existentes.
insert into public.profiles (user_id, first_name, last_name, birth_date, role)
select u.id, m.first_name, m.last_name, m.birth_date, 'user'
from auth.users u cross join lateral public.elite_profile_metadata(u.raw_user_meta_data) m
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
-- También elimina grants por columna previos si se vuelve a ejecutar la migración.
revoke all (id, user_id, first_name, last_name, birth_date, role, created_at)
  on public.profiles from public, anon, authenticated;
revoke all on sequence public.profiles_id_seq from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, birth_date) on public.profiles to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
