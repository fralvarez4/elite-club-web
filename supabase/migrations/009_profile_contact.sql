-- Ejecutar manualmente como postgres después de 002_profiles.sql.
-- No cambia pedidos existentes ni copia direcciones a ellos.
begin;

alter table public.profiles
  add column if not exists phone varchar(50),
  add column if not exists street varchar(200),
  add column if not exists street_number varchar(30),
  add column if not exists apartment varchar(100),
  add column if not exists postal_code varchar(20),
  add column if not exists city varchar(100),
  add column if not exists province varchar(100),
  add column if not exists instructions varchar(1000);

-- Campos opcionales: NULL significa que el usuario todavía no los completó.
-- Los datos de cada pedido se guardan por separado en order_delivery.
alter table public.profiles
  drop constraint if exists profiles_contact_not_blank,
  add constraint profiles_contact_not_blank check (
    (phone is null or length(btrim(phone)) > 0) and
    (street is null or length(btrim(street)) > 0) and
    (street_number is null or length(btrim(street_number)) > 0) and
    (apartment is null or length(btrim(apartment)) > 0) and
    (postal_code is null or length(btrim(postal_code)) > 0) and
    (city is null or length(btrim(city)) > 0) and
    (province is null or length(btrim(province)) > 0) and
    (instructions is null or length(btrim(instructions)) > 0)
  );

revoke update (phone, street, street_number, apartment, postal_code, city, province, instructions)
  on public.profiles from public, anon, authenticated;
grant update (phone, street, street_number, apartment, postal_code, city, province, instructions)
  on public.profiles to authenticated;
-- La política profiles_update_own de 002 limita las escrituras al dueño.
commit;
