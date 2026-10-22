-- PROPUESTA PARA REVISION. No ejecutar todavia.
-- Orden: 001..006 -> 007_products_price -> 008_rate_limiting.
-- No carga precios, no modifica productos ni pedidos existentes.
begin;

-- Sin escala declarada: el CHECK rechaza fracciones extra sin redondearlas.
-- Si ya existe, conserva su tipo y precision; no hace ALTER TYPE.
alter table public.products add column if not exists price numeric;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.products'::regclass
      and attname = 'price' and not attisdropped
      and atttypid = 'pg_catalog.numeric'::regtype
  ) then
    raise exception 'products.price debe ser numeric. Revisar el tipo existente; no se convierte automaticamente.';
  end if;

  if exists (select 1 from public.products where price is null) then
    raise exception 'Hay productos sin precio. Cargar precios reales antes de aplicar 007; no se generan valores de respaldo.';
  end if;
end;
$$;

-- Impide asignar un precio por defecto al omitir el campo. No cambia filas.
alter table public.products alter column price drop default;
alter table public.products alter column price set not null;

-- Mismo dominio monetario que validan las RPC 005/006 y los snapshots de pedidos.
-- Un valor existente incompatible aborta toda la migracion, sin corregirlo.
alter table public.products
  add constraint products_price_valid_007 check (
    price > 0
    and price <> 'NaN'::numeric
    and price <> 'Infinity'::numeric
    and price <> '-Infinity'::numeric
    and price <= 9999999999.99
    and price = round(price, 2)
  );

comment on column public.products.price is
  'Precio actual en ARS, obligatorio, positivo y finito, hasta dos decimales y maximo 9999999999.99. Sin valor por defecto. Los pedidos conservan su propio unit_price historico.';

-- No requiere indice: el codigo actual no filtra ni ordena por price.
-- No cambia RLS, grants, funciones ni snapshots de pedidos.
-- Base vacia: importar productos con precios reales DESPUES de esta migracion.
-- El seed historico derivado de products.json NO contiene price y no sirve
-- como importacion completa bajo este esquema. No rellenar con cero ni ficciones.
commit;
