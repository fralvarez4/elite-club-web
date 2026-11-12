# Elite Club

Marketplace académico con React y Next.js App Router. Los 74 precios cargados en Supabase provienen de una lista en USD. La migración `012_usd_base_ars_orders.sql` y el código publicado convierten cada pedido a ARS con cotización MEP verificada antes de habilitar el pago. Consultá [docs/ENTREGA_FINAL.md](docs/ENTREGA_FINAL.md) para el estado de entrega, la evidencia y los límites de las pruebas.

## Estado de entrega

El dueño aplicó manualmente las migraciones `009`–`012` en Supabase Production. El [PR #1](https://github.com/fralvarez4/elite-club-web/pull/1) se integró en `main` y la aplicación está publicada en [eliteclubstore.vercel.app](https://eliteclubstore.vercel.app/). CI pasó en `main`; se comprobaron catálogo con precios USD, acceso, pedido con total ARS, Checkout Pro, pago con comprador y tarjeta de prueba, notificación simulada de Mercado Pago con respuesta HTTP 200, pedido `approved` y mensaje de confirmación en la web. También se creó, editó, mostró en el catálogo y eliminó un producto temporal desde el panel administrador. Mercado Pago no envía notificaciones automáticas para pagos con credenciales de prueba en Checkout Pro vía Preferences API; la recepción se verificó con su simulador oficial. La [guía de entrega](docs/ENTREGA_FINAL.md) contiene la evidencia y el guion de demo. La aceptación de pagos reales no se ha probado.

## Ejecutar

`npm install` y `npm run dev`. Abrir http://localhost:3000.
Producción: `npm run build` y `npm start`.

## Funciones

- Búsqueda, filtros por categoría, marca y talle, orden por nombre y favoritos.
- Carrito CRUD: agregar, mostrar, actualizar cantidades (1–99), eliminar y vaciar con confirmación.
- Pedidos con precios base USD convertidos en Supabase a importes ARS, checkout en ARS y confirmación segura por webhook cuando los servicios externos están configurados.
- Perfil editable y datos de entrega reutilizables; visualización indicativa en ARS con cotización MEP reciente.
- Catálogo de solo lectura: los visitantes no pueden crear, editar ni eliminar productos.
- Registro, inicio y cierre de sesión con email y contraseña mediante Supabase Auth.
- Persistencia local, diseño adaptable y diálogos nativos accesibles.

El catálogo se carga desde Supabase en el servidor, ordenado por `sort_order`. `src/data/products.json` queda como respaldo temporal cuando no hay configuración o falla la consulta. El servidor registra un aviso si falta configuración y un error con diagnóstico si falla Supabase; el fallback nunca es silencioso. Una consulta exitosa sin filas muestra un catálogo vacío y un aviso para revisar el seed/RLS, sin sustituirlo por el JSON. Carrito y favoritos siguen en localStorage y no dependen de la cuenta; las antiguas modificaciones locales del catálogo se ignoran. El SDK de Supabase administra por separado la persistencia de sesión. El catálogo de respaldo no tiene precios y no permite finalizar compras. Para reiniciar carrito y favoritos, eliminar la clave elite-club-v1 de localStorage.

## Arquitectura

- app/layout.jsx: layout y metadatos de Next.js.
- app/page.jsx: Server Component que carga los datos iniciales.
- app/catalogo/page.jsx: catálogo con filtros de URL y carga desde el servidor.
- src/lib/supabase.js: cliente con Publishable Key, sin persistencia de sesiones.
- src/lib/supabaseBrowser.js: instancia única del navegador para Auth, con persistencia y renovación automática.
- src/lib/auth.jsx: contexto de sesión compartido; app/layout.jsx sigue siendo un Server Component.
- src/components/AuthForm.jsx: registro, login, cuenta y logout dentro del modal existente.
- src/lib/products.js: lectura de productos y respaldo temporal con diagnóstico.
- src/components/Store.jsx: componentes React, props, estados, efectos y controles de búsqueda y selección.
- src/lib/cart.js: operaciones inmutables con find, map y filter.
- app/globals.css: variables CSS, Grid, Flexbox y diseño adaptable.
- src/data/products.json: respaldo temporal de los campos seleccionados del Excel.
- public/products: fotos reales extraídas del Excel; algunas filas comparten foto.
- scripts/import-inventory.ps1: importación reproducible de los campos autorizados.

La clase 05 aporta catálogo y carrito persistente; la 06, React; la 07, Next.js y App Router. Las actividades de ejemplo ajenas al marketplace no son requisitos de esta aplicación.

## Verificación

`npm run lint`, `npm run build` y `npm test`.
Las pruebas usan Microsoft Edge instalado y validan CRUD, recarga, favoritos, rutas de compra simuladas y vista móvil. Las tipografías usan Google Fonts con respaldo local.
Referencia: https://nextjs.org/docs/app/getting-started/installation

Para regenerar imágenes WebP luego de importar: node scripts/optimize-images.mjs.

## Modelos, colores y talles

El catálogo inicial agrupa los 74 registros originales en 43 modelos. src/lib/catalog.js interpreta los colores escritos en los nombres (sin confundir la marca Off White con el color blanco), agrupa modelos y unifica las combinaciones repetidas de color y talle. El catálogo no admite modificaciones desde el navegador.

## Configurar Supabase: etapa 1 (base de datos)

Esta etapa crea únicamente `public.products`, con los seis campos originales de texto y `sort_order` entero (0 a 73 inicialmente). No migra carrito, favoritos o imágenes. Los IDs originales se conservan para no romper las referencias del carrito. `image` mantiene la ruta local `/products/...`; no hace falta Storage. La etapa 2 agrega Auth sin modificar esta tabla ni sus políticas.

1. Abrí el proyecto **Elite Club Web** en el dashboard de Supabase. En **SQL Editor**, creá una consulta, pegá el contenido completo de `supabase/migrations/001_products.sql` y ejecutá **Run**. Se crea la tabla, se activa RLS y se concede únicamente SELECT a `anon` y `authenticated`. No se crean políticas de escritura. El dashboard usa su rol administrativo para ejecutar estos scripts, no la clave de la aplicación.
2. Creá otra consulta en **SQL Editor**, pegá todo `supabase/seed.sql` y ejecutá **Run**. Importa los 74 registros sin traducir ni modificar sus campos y conserva su orden en `sort_order`. Puede repetirse: actualiza por ID sin duplicar. Atención: repetirlo sobrescribe los campos de esos IDs con los del JSON; no elimina registros adicionales.
3. Verificá los datos en **Table Editor → products** o ejecutá:

   ```sql
   select count(*) as total, min(sort_order) as primero, max(sort_order) as ultimo
   from public.products;
   -- En la importación inicial: 74, 0, 73.
   select * from public.products order by sort_order, id;
   ```

4. En **Connect** copiá la URL del proyecto y, en **Settings → API Keys**, la **Publishable key**, que empieza con `sb_publishable_`. No uses una Secret Key ni una clave administrativa. Consultá la [documentación oficial de claves](https://supabase.com/docs/guides/getting-started/api-keys) si cambian los nombres del menú.
5. En la raíz del proyecto, copiá `.env.example` a `.env.local` y completá:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
   ```

   `.env.local` está excluido de Git. La Publishable Key está diseñada para ser pública: la protección de datos depende de permisos y RLS. No agregues claves privilegiadas al proyecto.
6. Reiniciá `npm run dev` y abrí `/` y `/catalogo`. Búsqueda, filtros, colores y talles siguen funcionando sobre las filas leídas de Supabase. Revisá la **terminal donde corre Next.js**, no solo la consola del navegador: ahí aparecen los errores `[Elite Club/products]` y los avisos de respaldo. Las consultas tienen un timeout de 8 segundos y no se almacenan en la caché de datos. Para producción, configurá ambas variables en el hosting y volvé a ejecutar el build/despliegue.
7. Verificá los permisos con esta consulta (para ambos roles debe dar `puede_leer = true` y los tres permisos de escritura `false`):

   ```sql
   select rol,
     has_table_privilege(rol, 'public.products', 'SELECT') as puede_leer,
     has_table_privilege(rol, 'public.products', 'INSERT') as puede_insertar,
     has_table_privilege(rol, 'public.products', 'UPDATE') as puede_actualizar,
     has_table_privilege(rol, 'public.products', 'DELETE') as puede_eliminar
   from (values ('anon'), ('authenticated')) as roles(rol);
   select relrowsecurity from pg_class where oid = 'public.products'::regclass;
   -- true
   select policyname, cmd, roles from pg_policies
   where schemaname = 'public' and tablename = 'products';
   -- products_public_read, SELECT, {anon,authenticated}
   ```

La política permite lectura pública del catálogo; las escrituras quedan reservadas al dashboard/SQL Editor. Referencia: [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Para regenerar el seed desde el respaldo: `npm run db:seed:generate`. Este comando solo escribe `supabase/seed.sql`: no conecta a Supabase ni importa datos automáticamente. La base remota se configura manualmente con los pasos anteriores. Las pruebas locales verifican consultas, errores/fallback y seed; no sustituyen la verificación de permisos en el proyecto remoto.

Cada tarjeta tiene un botón + junto al corazón y muestras de color, divididas en dos cuando la variante es bicolor. Al elegir un color se despliegan los talles; al seleccionar uno se pliegan para ahorrar espacio. Se muestran XXS a XXL para prendas y los talles numéricos presentes en el catálogo para modelos numéricos; el talle único se selecciona automáticamente y no se muestra. Las opciones que no figuran para el color elegido aparecen tachadas y deshabilitadas. La disponibilidad representa combinaciones existentes en la planilla, no un stock sincronizado ni una cantidad inferida de las filas duplicadas.

El carrito identifica cada variante por su registro canónico y mantiene separados los colores y talles. Los carritos anteriores se resuelven a esas variantes, sumando los duplicados equivalentes. Quitar un artículo del carrito no modifica el catálogo. Las fotografías compartidas de varios colores se conservan tal como aparecen en el inventario. El zoom de las fotos sigue el cursor tanto en las tarjetas como en el detalle del producto.

## Configurar Supabase Auth: etapa 2 (email + contraseña)

Crear cuenta solicita nombre, apellido, fecha de nacimiento, email, contraseña y confirmación de contraseña. Nombre y apellido se recortan de espacios externos; la fecha se envía como `YYYY-MM-DD`, sin conversión de zona horaria. Estos tres campos se pasan a `signUp` mediante `options.data` como `first_name`, `last_name` y `birth_date`, y Supabase los guarda en `user_metadata`. La confirmación de contraseña no se envía ni se guarda. El formulario exige los campos, rechaza fechas futuras y contraseñas diferentes; no impone una edad mínima. No se necesitan cambios de tablas o RLS. [Referencia de signUp y metadata](https://supabase.com/docs/reference/javascript/auth-signup).

Para verificarlo con una cuenta nueva, abrí **Authentication → Users**, seleccioná el usuario y revisá sus metadatos (en la representación de la fila de `auth.users`, `raw_user_meta_data`). Las cuentas existentes pueden seguir iniciando sesión sin esos campos. Estos metadatos describen al usuario; no se usan para roles ni permisos.

El catálogo sigue público y su cliente no cambia. `supabaseBrowser.js` administra la sesión en cookies con `@supabase/ssr`, renueva tokens y notifica cambios a `AuthProvider`. `getSession()` se usa para la interfaz; el servidor verifica la identidad con `getUser()` y consulta el rol en `profiles`. Las cuentas pertenecen a `auth.users`. Las contraseñas solo se mantienen durante el envío del formulario y luego se limpian; no se guardan ni se registran en logs.

### Configuración manual del dashboard

1. Abrí **Elite Club Web → Authentication → Sign In / Providers → Email** (en algunas versiones aparece como **Providers → Email**). Activá el proveedor **Email**, la opción para permitir nuevos registros y **Confirm email**. Guardá. No hace falta habilitar otros proveedores. El formulario exige las seis condiciones de passwordChecks al registrarse y Supabase aplica además los requisitos que configures para contraseñas.
2. En **Authentication → URL Configuration**, para desarrollo local configurá:

   | Campo | Valor |
   | --- | --- |
   | Site URL | `http://localhost:3000` |
   | Redirect URLs (agregar entrada exacta) | `http://localhost:3000/auth/callback?flow=confirm` |

   Si navegás usando `127.0.0.1`, agregá también `http://127.0.0.1:3000/auth/callback?flow=confirm`. Si usás otro puerto, reemplazá `3000` por ese puerto. Conviene usar siempre el mismo origen: localhost y 127.0.0.1 tienen sesiones separadas.

   Cuando publiques, cambiá **Site URL** a tu dominio HTTPS real y agregá su URL exacta de retorno: `https://tu-dominio.com/auth/callback?flow=confirm`. El código construye esa dirección a partir del origen donde se hace el registro. Podés conservar las entradas locales si seguís desarrollando. [Referencia oficial de redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).
3. En **Authentication → Email Templates → Confirm signup**, conservá `{{ .ConfirmationURL }}`. Supabase confirma el email y vuelve a `/auth/callback`, que intercambia el código PKCE por la sesión. Abrí el enlace en el mismo navegador del registro; si el email se confirmó pero el intercambio falla en otro navegador, iniciá sesión con email y contraseña. [Registro con contraseña](https://supabase.com/docs/guides/auth/passwords).
4. Para probar los correos sin SMTP propio, usá el email de tu cuenta que pertenece al equipo de Supabase. El envío predeterminado está restringido a direcciones del equipo y tiene un límite reducido (actualmente 2 emails por hora). Para registrar amigos u otros usuarios, configurá **Authentication → Email → SMTP Settings** con un proveedor SMTP: habilitá SMTP personalizado y completá remitente, nombre, host, puerto, usuario y contraseña suministrados por ese proveedor. Las credenciales SMTP quedan en Supabase, no en `.env.local` ni en el frontend. [Restricciones y configuración oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
5. Conservá las dos variables públicas existentes en `.env.local`. No necesitás agregar ninguna otra clave. Reiniciá `npm run dev` si cambiaste variables. Abrí `http://localhost:3000`.

### Prueba manual de principio a fin

1. **Visitante:** abrí la web sin sesión. Confirmá que podés ver/buscar productos y utilizar carrito y favoritos.
2. **Registro:** tocá el icono de cuenta del header → **No tengo cuenta. Crear cuenta**. Completá nombre, apellido, fecha de nacimiento, un email al que tengas acceso y una contraseña válida; repetí la misma contraseña en la confirmación. Debe aparecer el aviso para revisar el correo, sin marcar la cuenta como autenticada. En **Authentication → Users** aparecerá la cuenta pendiente de confirmación con sus metadatos. Para evitar enumerar usuarios, Supabase puede dar una respuesta similar si la cuenta ya existe: no supongas que eso crea otra cuenta.
3. **Email pendiente:** intentá iniciar sesión antes de confirmar; debe aparecer el mensaje de email no confirmado. Revisá bandeja de entrada y spam.
4. **Confirmación:** abrí el enlace del correo con el servidor local encendido. Debe volver al inicio, abrir **Mi cuenta** y mostrar tu email. En **Authentication → Users**, verificá que el email figure confirmado. Los tokens del retorno se retiran de la barra de direcciones. Un enlace vencido o inválido muestra un error en el modal.
5. **Logout:** pulsá **Cerrar sesión**. El icono vuelve al acceso de login y el modal avisa que cerraste sesión. El cierre se aplica a este navegador y se sincroniza con sus otras pestañas; no cierra otras computadoras. Carrito y favoritos permanecen intactos. Si el servidor falla pero el SDK elimina la sesión local, el modal informa esa diferencia.
6. **Login:** entrá de nuevo con email y contraseña. Probá primero una contraseña incorrecta para comprobar el mensaje de error; después ingresá la correcta. Se debe mostrar tu email y la opción de cerrar sesión.
7. **Persistencia:** recargá la página, navegá a `/catalogo` y abrí otra pestaña del mismo origen. Debés seguir autenticado mientras la sesión siga vigente y el navegador conserve su almacenamiento. Cerrá sesión y recargá: debe permanecer cerrada.

La opción de email confirmado deshabilitada también está contemplada: si Supabase devuelve una sesión al registrarse, la interfaz muestra la cuenta inmediatamente. Para probar el flujo de confirmación solicitado, dejá **Confirm email** activado.

### Pruebas automatizadas

`npm test -- tests/auth.spec.js` cubre visitantes, registro con/sin confirmación, retorno de email, login, errores, persistencia, renovación de sesión, logout entre pestañas, conservación de carrito/favoritos y traducciones. Intercepta los endpoints de Auth con respuestas simuladas: no crea usuarios reales ni envía correos. Usa las variables públicas ya configuradas para inicializar el SDK, y el catálogo mantiene su carga habitual. El envío real de correo y los ajustes del dashboard deben verificarse con la prueba manual anterior.

## Perfiles automáticos y OAuth Google

### 1. Ejecutar la migración de perfiles

En **Supabase → SQL Editor**, como rol `postgres`, pegá y ejecutá el contenido completo de `supabase/migrations/002_profiles.sql`. No vuelvas a ejecutar el seed de productos para esta etapa.

La migración crea `public.profiles` con `id BIGINT GENERATED ALWAYS AS IDENTITY`, `user_id UUID UNIQUE` relacionado con `auth.users.id`, nombre, apellido, nacimiento, `role` y fecha de creación. La FK elimina el perfil si un operador autorizado elimina su cuenta. El rol permite solamente `user`/`admin` y su valor inicial siempre es `user`.

El trigger `elite_profile_after_signup`, **AFTER INSERT ON auth.users**, crea el perfil dentro de la misma transacción del registro, para Email y Google. También se crean perfiles para cuentas anteriores a esta migración. La restricción UNIQUE y `ON CONFLICT DO NOTHING` evitan duplicados. Repetir la migración no reemplaza datos personales, roles o IDs existentes. El número de cliente es `EC-` más el ID con al menos seis dígitos; puede haber saltos de numeración, no se recicla ni se renumera en cada login.

`elite_create_profile()` usa `SECURITY DEFINER` y `search_path` vacío con referencias de esquema explícitas. Las funciones auxiliares no tienen permiso EXECUTE para `anon`, `authenticated` ni PUBLIC. No existe una RPC de creación accesible al frontend. Los metadatos solo aportan `first_name`/`given_name`, `last_name`/`family_name` y `birth_date`; nombres inválidos y fechas imposibles/futuras quedan NULL en vez de bloquear el registro. El rol, ID, propietario y fecha de creación nunca se toman de metadata. Un error real en el trigger revierte el alta de Auth: revisá los logs de Supabase si aparece “Database error saving new user”.

RLS permite SELECT/UPDATE de la propia fila mediante `auth.uid() = user_id`, con `USING` y `WITH CHECK`. Los grants permiten UPDATE **solo de `first_name`, `last_name`, `birth_date`**. Se revocan las escrituras sobre `role`, `id`, `user_id`, `created_at`, así como INSERT/DELETE y el uso de la secuencia desde el cliente. Esto impide elevar privilegios aunque se manipule el JavaScript o se llame directamente a la API. La migración 003 agrega administración de productos para `admin`, sin habilitar cambios de rol desde la aplicación. [Permisos por columna](https://supabase.com/docs/guides/database/postgres/column-level-security).

Verificación manual después de ejecutar el SQL:

```sql
-- Debe devolver 0: todas las cuentas existentes tienen perfil.
select count(*) as cuentas_sin_perfil
from auth.users u left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- Debe devolver 0 filas.
select user_id, count(*) from public.profiles group by user_id having count(*) > 1;

-- Debe mostrar first_name/last_name/birth_date = true; resto = false.
select columna, has_column_privilege('authenticated', 'public.profiles', columna, 'UPDATE') as puede_actualizar
from (values ('first_name'), ('last_name'), ('birth_date'), ('role'), ('id'), ('user_id'), ('created_at')) as campos(columna);

-- INSERT y DELETE deben ser false.
select has_table_privilege('authenticated', 'public.profiles', 'INSERT') as puede_insertar,
       has_table_privilege('authenticated', 'public.profiles', 'DELETE') as puede_eliminar;
select relrowsecurity from pg_class where oid = 'public.profiles'::regclass;
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles';
```

### 2. URLs de retorno

En **Authentication → URL Configuration**:

| Entorno | Site URL | Redirect URL que hay que agregar |
| --- | --- | --- |
| Desarrollo | `http://localhost:3000` | `http://localhost:3000/auth/callback?flow=oauth` y `http://localhost:3000/auth/callback?flow=confirm` |
| Producción | `https://TU-DOMINIO.vercel.app` o tu dominio propio | `https://TU-DOMINIO.vercel.app/auth/callback?flow=oauth` y `https://TU-DOMINIO.vercel.app/auth/callback?flow=confirm` |

Conservá temporalmente las entradas antiguas `/?auth=confirm` y `/?auth=oauth` para enlaces ya enviados. Si utilizás 127.0.0.1 u otro puerto, agregá la entrada correspondiente. Los despliegues preview necesitan su URL exacta permitida; no habilites un comodín para todos los sitios de Vercel. En Vercel configurá las dos variables públicas ya existentes y volvé a desplegar. No se agregan variables con secretos OAuth al proyecto.

El callback del proveedor y el retorno a la web son dos direcciones diferentes:

```text
Google → https://TU-PROYECTO.supabase.co/auth/v1/callback
            → http://localhost:3000/auth/callback?flow=oauth&code=…
            → servidor intercambia código PKCE → cookies → SELECT profiles → Mi cuenta
```

La sesión usa cookies con `@supabase/ssr` y PKCE. `/auth/callback` intercambia el código en el servidor y vuelve al inicio sin aceptar destinos externos. El layout sigue siendo Server Component. Los enlaces anteriores con tokens en el fragmento siguen siendo aceptados en el navegador y se limpian de la URL. Abrí el nuevo enlace de confirmación en el mismo navegador donde te registraste (necesita el verificador PKCE); si abrís otro navegador y el email ya quedó confirmado, iniciá sesión con email y contraseña.

### 3. Google

1. En Google Cloud/Google Auth Platform, prepará el proyecto, la pantalla de consentimiento (nombre de la aplicación, soporte, audiencia) y usuarios de prueba si está en modo Testing. Usá los permisos de identidad básicos `openid`, email y perfil, sin pedir acceso a contactos u otros datos.
2. Creá un OAuth Client ID de tipo **Web application**. Agregá `http://localhost:3000` y el origen HTTPS de tu web en **Authorized JavaScript origins**.
3. En **Authorized redirect URIs**, copiá la Callback URL de **Supabase → Authentication → Providers → Google**. Para este proyecto alojado en Supabase es `https://TU-PROYECTO.supabase.co/auth/v1/callback`, incluso mientras la página corre en localhost.
4. Activá Google en Supabase y pegá allí el **Client ID** y el **Client Secret**. Guardá. El secret no va en Git, `.env.local` ni variables públicas de Vercel.
5. Probá **Continuar con Google**. Al volver se leerá el perfil del trigger; normalmente habrá que completar al menos la fecha de nacimiento. [Guía oficial](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 4. Perfil y verificación del flujo

El frontend hace exclusivamente SELECT/PATCH de perfiles. Si no encuentra la fila o falta ejecutar la migración, muestra un error con botón **Reintentar**, registra el diagnóstico y mantiene disponible el logout y el catálogo. Nunca intenta INSERT, upsert ni una RPC de creación.

Después del login, si faltan nombre, apellido o nacimiento, se abre **Completá tu perfil** y se piden únicamente los campos faltantes. Se guardan en `profiles`; los valores ya completados no se sobrescriben en futuros logins. “Mi cuenta” muestra nombre, apellido, email, ID de cliente, nacimiento y métodos de acceso vinculados (no pretende deducir el último proveedor utilizado). El modal se puede cerrar para seguir viendo el catálogo público.

Probá el siguiente recorrido: crear cuenta Email → confirmar → consultar perfil; Google → completar campos faltantes → recargar → cerrar sesión → volver a entrar. Debe mantenerse el mismo `user_id`, ID numérico y código EC. Verificá además que una segunda cuenta no pueda consultar ni actualizar la primera usando su JWT. La unicidad es por `auth.users.id`, no por nombre. No se fusionan cuentas manualmente ni se agregan roles administrativos desde la web.

Pruebas: `npm test -- tests/auth.spec.js tests/profiles-db.spec.js`. PGlite es una dependencia exclusiva de desarrollo que ejecuta PostgreSQL en memoria para comprobar la migración real, trigger, backfill, unicidad, RLS y denegación de cambios de rol/propietario. Las tablas `auth.users` y `auth.uid()` se simulan en ese entorno; no se modifica la base remota. Las pruebas del navegador interceptan OAuth y perfiles, por lo que no prueban los secretos del proveedor ni crean cuentas reales. El login real con Google debe verificarse manualmente después de configurar sus consolas.

## Administración de productos y sesiones con cookies

### Activación manual en Supabase

1. Con 001 y 002 ya ejecutadas, abrí **SQL Editor → New query** y copiá **todo el contenido de [003_products_admin.sql](supabase/migrations/003_products_admin.sql)**, desde `begin;` hasta `commit;`. Ejecutá **Run**. La aplicación no ejecuta migraciones automáticamente. No vuelvas a ejecutar 001: revoca los permisos administrativos de productos.
2. La migración conserva `products_public_read` y agrega INSERT/UPDATE/DELETE únicamente cuando el perfil correspondiente a `auth.uid()` tiene `role = 'admin'`. El grant a `authenticated` habilita evaluar esas políticas; no concede escritura a todos los usuarios. También reafirma UPDATE de perfiles únicamente sobre los tres campos personales.
3. En **Authentication → Users**, copiá el UUID de la cuenta que querés administrar. Ejecutá manualmente, reemplazando el UUID:

   ```sql
   update public.profiles
   set role = 'admin'
   where user_id = 'PEGAR-UUID-REAL'::uuid
   returning user_id, role;
   ```

   Debe devolver exactamente una fila. Los registros nuevos siguen teniendo `role = 'user'`; ni usuarios ni administradores pueden asignar roles desde la web. Para revocar, ejecutá el mismo UPDATE con `role = 'user'`.
4. En **Authentication → URL Configuration**, agregá las dos URLs `/auth/callback?flow=oauth` y `/auth/callback?flow=confirm` indicadas arriba para localhost y para tu dominio real. Google Cloud siguen apuntando al callback de **Supabase**, no al de Next. No cambian los secretos del proveedor ni las variables de entorno.
5. Reiniciá `npm run dev` y recargá la cuenta. Si tiene rol admin, **Mi cuenta → Administración** abre `/admin`.

### Sesiones y límites de acceso

`supabaseBrowser.js` usa cookies, persistencia y renovación; `supabaseServer.js` crea un cliente por petición con la misma Publishable Key y cookies del usuario. `proxy.js` renueva cookies para rutas administrativas. La autorización no depende del proxy: `/admin` y cada método de API llaman independientemente a `requireAdmin()`, que valida el usuario mediante `auth.getUser()` y consulta su rol por UUID en `profiles`, sin caché. No se usa el rol de metadata, del JWT o del estado de React. Sin sesión responde 401; con rol no administrativo, 403; un fallo al verificar el rol impide el acceso. RLS vuelve a comprobar el rol al ejecutar el CRUD.

Next necesita `experimental.authInterrupts` para devolver 401/403 desde la página Server Component; esa opción está acotada en `next.config.js`. `app/layout.jsx` continúa siendo Server Component. La ruta de callback solo permite volver al inicio del mismo origen; las mutaciones administrativas requieren JSON válido (POST/PATCH), campos permitidos y Origin del propio sitio.

Al abrir la web, una sesión anterior de localStorage se intenta importar una sola vez a cookies mediante Supabase Auth. Después se elimina únicamente la entrada antigua de Auth, nunca carrito/favoritos. **No hace falta cerrar sesión de antemano**. Si la sesión anterior está vencida o fue revocada, se muestra un mensaje para volver a iniciar sesión. Un registro pendiente en otro navegador puede confirmar el email pero no completar PKCE: en ese caso entrá con email/contraseña. Se conservan enlaces antiguos con fragmentos de tokens.

### Comprobación manual

1. En incógnito: el catálogo abre normalmente; `/admin` y `/api/admin/products` devuelven 401.
2. Con una cuenta `user`: el catálogo y la cuenta funcionan, no aparece Administración; las rutas administrativas devuelven 403, aun entrando por URL.
3. Con una cuenta `admin`: agregá un producto de prueba usando una ruta existente de `/products/` o URL HTTPS, editá nombre/talle/orden, recargá el catálogo y eliminá ese producto. El panel administra filas de inventario, incluyendo variantes. Conserva los IDs al editar y utiliza `sort_order`; no administra precios ni sube archivos.
4. Revocá el rol desde SQL Editor y repetí una operación sin cerrar sesión: debe denegarse. El enlace de la interfaz se actualizará al recargar, pero la autorización del servidor es inmediata.
5. Probá registro → confirmación de email (mismo navegador) → login, Google → retorno → recargar, y logout → recargar. La sesión debe persistir hasta cerrar sesión; carrito/favoritos se conservan.

### Verificación automatizada

```sh
npm run lint
npm test -- --workers=2
npx playwright test --config playwright.admin.config.js
npm run build
```

La suite administrativa adicional levanta Next en el puerto 3100 y un Supabase simulado exclusivamente local en 3101. Verifica las rutas reales, cookies falsificadas, 403, CRUD, revocación y callback PKCE; no modifica Supabase remoto. PGlite ejecuta las migraciones reales y verifica RLS y permisos por columna. Google y envío real de email necesitan la comprobación manual indicada arriba. No se modificaron precios, pedidos, pagos, carrito, favoritos ni fallback del catálogo.

## API de pedidos

La API permite crear y consultar pedidos. El flujo de entrega que conecta el carrito requiere también la migración 006, descripta al final de este documento.

### Activación manual

Con `orders` y `order_items` ya creadas mediante 004, copiá el contenido completo de [005_create_order.sql](supabase/migrations/005_create_order.sql) en **Supabase → SQL Editor** y ejecutalo como `postgres`. No vuelvas a ejecutar 004 sobre tablas existentes. La aplicación no ejecuta migraciones automáticamente y no necesita nuevas variables de entorno ni claves privadas.

005 crea la firma inicial de la RPC; 006 la reemplaza por `public.elite_create_order(jsonb, jsonb)` y concede exclusivamente EXECUTE a `authenticated`. Conserva RLS y los permisos de solo SELECT de las tablas. La función `SECURITY DEFINER` utiliza los privilegios de su propietario para insertar, con `search_path` vacío, nombres de tablas calificados e identidad obtenida de `auth.uid()`. Por eso valida también los datos dentro de PostgreSQL: un usuario podría invocar la RPC directamente y debe recibir las mismas restricciones. No se utiliza `service_role`.

### Contrato HTTP

Todos los endpoints requieren la sesión existente en cookies y verifican el usuario con `auth.getUser()`. Las respuestas llevan `Cache-Control: private, no-store`.

| Método y ruta | Resultado |
| --- | --- |
| `POST /api/v1/orders` | 201, `{ "order": { ... } }`, incluyendo sus `order_items`; header `Location` con la ruta de consulta |
| `GET /api/v1/orders?limit=20&offset=0` | 200, `{ "orders": [...], "limit": 20, "offset": 0, "has_more": false }` |
| `GET /api/v1/orders/UUID` | 200, `{ "order": { ... } }`, incluyendo `order_items` |

Los usuarios ven únicamente pedidos propios. Un admin puede consultar todos; el rol se vuelve a leer desde `profiles` por UUID verificado en cada GET. Se aplican filtros de propietario en el servidor para usuarios comunes y RLS en Supabase. Un pedido ajeno o inexistente devuelve el mismo 404. La lista se ordena por fecha e ID descendentes, con límite máximo 100 y offset máximo 10000.

El POST acepta exclusivamente:

```json
{
  "items": [
    { "product_id": "elite-2", "quantity": 2 }
  ],
  "delivery": { "method": "pickup", "first_name": "Ana", "last_name": "Pérez", "phone": "123456789" }
}
```

Usá IDs reales de filas de `products`, correspondientes a la variante elegida. Se admiten de 1 a 100 ítems, sin IDs repetidos, con cantidades enteras de 1 a 99 y un cuerpo máximo de 16 KiB. `user_id`, `status`, `total`, `unit_price` y cualquier campo adicional son rechazados. Se exige `Content-Type: application/json` y `Origin` igual al origen del sitio como protección CSRF; herramientas como curl deben enviar también ese Origin y la sesión válida en cookies.

La RPC obtiene los precios actuales de Supabase, exige importes positivos finitos con hasta dos decimales compatibles con `NUMERIC(12,2)`, guarda el precio histórico y calcula el total con aritmética decimal. Bloquea los productos con `FOR SHARE`, en un orden consistente, durante la creación. El pedido siempre pertenece al usuario autenticado y empieza en `pending`, incluso si lo crea un admin. Una sola transacción inserta pedido e ítems; cualquier error revierte ambos.

Respuestas de error: 400 para datos inválidos o productos inexistentes, 401 sin sesión, 403 para origen no permitido o permisos insuficientes, 404 para pedido no visible, 409 para precios/importes incompatibles o conflicto de bloqueo, 413 para cuerpo excesivo, 415 para tipo de contenido incorrecto y 503 si falla el servicio o falta instalar la RPC. Se devuelven mensajes controlados y los detalles técnicos quedan en los logs del servidor.

### Prueba desde el navegador

Luego de ejecutar 005 y 006 en orden, iniciá sesión y abrí la consola en la web. Este ejemplo **crea un pedido real pendiente** usando el precio de Supabase:

```js
const response = await fetch('/api/v1/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [{ product_id: 'elite-2', quantity: 1 }], delivery: { method: 'pickup', first_name: 'Ana', last_name: 'Pérez', phone: '123456789' } }),
})
const result = await response.json()
console.log(response.status, result)
if (response.ok) {
  console.log(await (await fetch(`/api/v1/orders/${result.order.id}`)).json())
}
console.log(await (await fetch('/api/v1/orders')).json())
```

Probá luego desde otra cuenta: el primer pedido no debe aparecer y su URL debe responder 404; con admin debe ser visible. Modificá el precio del producto y comprobá que el `unit_price` del pedido previo permanezca intacto. Los productos con historial no pueden eliminarse físicamente por la FK RESTRICT de 004.

Cada POST válido crea un pedido nuevo: esta etapa no implementa idempotencia ni reintentos automáticos. Si perdés la respuesta por un problema de conexión, consultá los pedidos antes de repetir el POST.

Verificación local sin escribir en Supabase remoto:

```sh
npx playwright test tests/orders.spec.js tests/orders-db.spec.js --workers=2
npx playwright test --config playwright.admin.config.js
npm run lint
npm run build
```

PGlite ejecuta el SQL real para probar cálculo decimal, snapshots, rollback, RLS y bloqueo de escrituras directas. La suite de integración HTTP utiliza un backend simulado local para probar las rutas Next, validación, cookies manipuladas y separación entre usuarios.

## Checkout Pro de Mercado Pago

`POST /api/v1/checkout` inicia Checkout únicamente para el propietario autenticado del pedido, incluso cuando quien consulta es admin. No modifica `orders.status`: sólo el webhook verificado y la RPC de `010_payment_webhooks.sql` pueden aprobarlo. El botón del carrito conduce a este flujo.

Antes de Checkout, `POST /api/v1/orders` obtiene la cotización MEP venta de DolarAPI y la guarda mediante una RPC exclusiva de `service_role`. La migración `012` convierte los precios USD a ARS en PostgreSQL, conserva ambos precios unitarios y la cotización en el pedido, y deja intactos los pedidos históricos. La revisión muestra el total ARS fijado por el servidor y exige una segunda confirmación para ir a Mercado Pago. Si falta cotización reciente, el pedido no se crea.

### Configuración del servidor

Conservá `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_COLLECTOR_ID` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y configurá `APP_URL` con el origen HTTPS público real de la tienda. En producción, configurá estas variables en el servidor y volvé a desplegar. Ninguna utiliza el prefijo `NEXT_PUBLIC_`; no pegues secretos en código, Git ni el navegador. El endpoint rechaza pagos cuando falta la configuración del webhook.

`APP_URL` debe ser un origen HTTPS sin credenciales, ruta, query ni fragmento. Se rechazan localhost, direcciones privadas/reservadas y dominios que no resuelvan a direcciones públicas. Si falta o no es válida, el endpoint responde 503 con un mensaje de configuración y no crea la Preference. Para probar desde desarrollo local necesitás igualmente un dominio HTTPS público para el retorno (un despliegue o túnel propio). [URLs de retorno de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/configure-back-urls).

### Solicitud y respuesta

Con sesión iniciada, enviá únicamente:

```json
{ "order_id": "UUID_DEL_PEDIDO" }
```

La validación usa Zod estricto, límite de 1 KiB y comprobación de Origin. La respuesta exitosa es 201:

```json
{
  "preference_id": "ID_DE_LA_PREFERENCE",
  "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
}
```

Se verifica la identidad con Supabase Auth y se filtra siempre por `user_id`, además de RLS. Un pedido ajeno devuelve 404, también para admin. Un pedido fuera de `pending`, vacío, sin entrega o con importes inconsistentes devuelve 409. Los importes se convierten a centavos enteros con BigInt para comparar los ítems con `subtotal`, y `subtotal + shipping_cost` con `total`.

La Preference incluye `external_reference = order.id`, `auto_return: 'approved'` e ítems en ARS. Los títulos se leen desde `products.name`; los precios proceden exclusivamente de `order_items.unit_price`. Nunca se consulta el precio actual para cobrar el pedido. Se envía al endpoint fijo de Mercado Pago mediante el Access Token del servidor; no se reenvían errores crudos ni credenciales al cliente.

Las tres `back_urls` apuntan al inicio existente del sitio:

```text
APP_URL/?checkout=success&order_id=UUID
APP_URL/?checkout=pending&order_id=UUID
APP_URL/?checkout=failure&order_id=UUID
```

Esos parámetros son únicamente navegación: no acreditan un pago ni actualizan el pedido. La tienda consulta el estado autenticado de la orden; sólo muestra el pago como confirmado después de que el webhook verificado registre `approved`.

Otros errores: 400 para body inválido, 401 sin sesión, 403 para Origin incorrecto, 413 para cuerpo excesivo, 415 para contenido no JSON, 502 si Mercado Pago falla o devuelve una respuesta inválida, 503 para configuración/servicios no disponibles. Las respuestas no se cachean.

La migración `011_checkout_preferences.sql` reserva una sola Preference por pedido y reutiliza su URL en los reintentos. Si la respuesta de Mercado Pago es incierta o falla el registro de la Preference, la reserva queda en `creating` y otro POST devuelve 409. Se debe revisar ese pedido con Mercado Pago antes de cualquier recuperación manual; no se libera la reserva automáticamente. Las migraciones `009`, `010` y `011` se aplican en ese orden antes de habilitar Checkout.

### Prueba manual y automatizada

Tras configurar las variables y reiniciar Next, podés ejecutar desde la consola de la tienda con sesión iniciada:

```js
const response = await fetch('/api/v1/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ order_id: 'REEMPLAZAR-POR-UUID-DE-PEDIDO-PROPIO' }),
})
const result = await response.json()
console.log(response.status, result)
// Solo si querés abrir Checkout y response.ok es true:
// window.location.assign(result.init_point)
```

Esto crea una Preference en la cuenta correspondiente al token; usá credenciales y usuarios de prueba de Mercado Pago para verificar el flujo sin pagos reales. Las pruebas automatizadas no usan el Access Token real ni contactan Mercado Pago: la integración utiliza un preload exclusivo de tests para interceptar el destino fijo, sin agregar opciones de reemplazo de URL en producción.

```sh
npx playwright test tests/checkout.spec.js --workers=1
npx playwright test --config playwright.admin.config.js
npm run lint
npm run build
```

Se reutiliza Zod 4.6.5, que ya estaba instalado indirectamente; ahora queda declarado como dependencia de producción para que esté disponible también al desplegar sin dependencias de desarrollo.

### Entrega y revisión del pedido — migración 006

La aplicación requiere ahora `006_order_delivery.sql`. No se ejecuta automáticamente.
Para activarla localmente, detener Next, ejecutar manualmente el archivo completo en
Supabase SQL Editor (después de 001–005) y reiniciar esta versión de la aplicación.
No volver a ejecutar 005 después de 006: restauraría la firma antigua sin entrega.
Si hay otra instancia usando la API anterior, detenerla o actualizarla en la misma
ventana de mantenimiento antes de habilitar pedidos. La firma antigua se elimina.

`GET /api/v1/delivery-options` lee las opciones habilitadas desde la base.
El carrito abre Datos de entrega, después Revisión, y solo el botón
“Pagar con Mercado Pago” crea el pedido. El retiro muestra la dirección, horario y
contacto obtenidos de la configuración. Ambos métodos están configurados sin costo.

El nuevo contrato de `POST /api/v1/orders` es:

```json
{
  "items": [{ "product_id": "ID-DEL-PRODUCTO", "quantity": 1 }],
  "delivery": {
    "method": "pickup",
    "first_name": "Ana",
    "last_name": "Pérez",
    "phone": "1161406462"
  }
}
```

Para `shipping`, agregar `street`, `street_number`, `postal_code`, `city`,
`province` y opcionalmente `apartment` e `instructions`. Zod rechaza campos extra,
incluidos importes, estado y datos del punto de retiro. La RPC recibe `p_items` y
`p_delivery`, calcula los importes y conserva los datos históricos de entrega.
GET de listado y detalle incluyen `subtotal`, `shipping_cost` y `order_delivery`.

Checkout verifica exactamente en centavos que los ítems sumen `subtotal` y que
`total = subtotal + shipping_cost`. Un envío con costo futuro se incluye como una
línea de la Preference, siempre desde el importe guardado. Retiro exige costo cero.
Los pedidos anteriores sin entrega deben reemplazarse por uno nuevo para pagar.

Si cambia el total al crear el pedido, la pantalla muestra el importe guardado y
solicita una nueva confirmación. Si falla Mercado Pago, reintentar en la misma
pantalla reutiliza el pedido pendiente. Cerrar o recargar pierde ese estado de
pantalla: aún no hay recuperación de borradores ni idempotencia entre visitas.
Una respuesta de red perdida al crear el pedido no se reintenta automáticamente.
El carrito no se vacía al crear el pedido ni al redirigir. Al volver, la interfaz consulta el estado almacenado; si está aprobado y el carrito coincide exactamente con los ítems pagados, lo vacía. No hay gestión de stock.

Prueba manual: iniciar sesión, agregar una prenda, completar envío o retiro y
entrar a Revisión; todavía no debe existir un pedido nuevo. Pulsar Pagar crea un
pedido `pending` con entrega y abre Checkout Pro con credenciales de prueba.
Comprobar también datos incompletos, acceso a pedidos ajenos y reintento ante un
fallo del proveedor. Las pruebas automatizadas usan datos locales y Mercado Pago
simulado, sin ejecutar migraciones remotas ni crear Preferences reales.

## Security Architecture

### Responsabilidades y estado del endurecimiento

Elite Club nunca almacena contraseñas en sus propias tablas. Las credenciales se
envían exclusivamente a Supabase Auth, que gestiona hashing con bcrypt y salting.
Una sal aleatoria diferencia los hashes de contraseñas iguales; el hash permite
verificar la contraseña sin guardar su texto. No implementamos hashing propio.
El formulario mantiene la contraseña temporalmente en memoria y la limpia al
terminar el intento; no la registra en logs, URLs ni almacenamiento del navegador.

Autenticación (AuthN) responde quién es el usuario: el servidor consulta Auth
mediante getUser(). Autorización (AuthO) decide qué puede hacer: consulta el rol
en profiles con el UUID verificado y aplica propiedad del recurso. RBAC distingue
user y admin; visitante significa ausencia de sesión. Ocultar botones es UX,
no autorización. Las rutas administrativas vuelven a verificar permisos aunque
el proxy haya procesado la sesión. RLS y permisos de columnas protegen la base:
el usuario no puede modificar profiles.role ni datos privados ajenos.

401 indica ausencia de autenticación válida, 403 falta de permiso y 404 recurso
inexistente/no visible. 429 corresponde a exceso de solicitudes; el limitador
persistente propio está implementado en 008, aplicado antes de las migraciones 009–012.
Un límite solo en Next.js no protege
una RPC que también pueda invocarse directamente: debe existir control adicional
en esa función/base, sin permitir que authenticated reinicie sus contadores.

Supabase emite JWT y renueva sesiones. Un JWT firmado no está cifrado: no debe
contener secretos ni metadata personal innecesaria. El rol del cliente no se usa
para autorizar. Google OAuth usa el SDK oficial y PKCE; no hay OAuth artesanal.
La arquitectura SSR comparte cookies con el cliente del navegador, por lo que
no se fuerza HttpOnly de forma incompatible. El endurecimiento de Secure y la
retirada de compatibilidad antigua siguen pendientes de pruebas completas.

Las APIs validan payloads, tipos, campos permitidos y Origin. Los cuerpos JSON
de admin, pedidos y checkout tienen límites de bytes durante su lectura, aun sin
Content-Length confiable. React escapa texto; no se debe sustituir esa protección
por eliminación indiscriminada de caracteres válidos de nombres o direcciones.
Los errores inesperados de administración no exponen mensajes del proveedor;
los logs revisados de perfiles y pedidos solo contienen categorías controladas.
Nunca registrar contraseñas, tokens, cookies, firmas, secretos ni cuerpos sensibles.

### Paso manual: política real de Supabase Auth

La validación del registro y su checklist requieren seis condiciones: 10 caracteres,
una minúscula, una mayúscula, un número, un símbolo y confirmación coincidente.
La función compartida passwordChecks se reutilizará al implementar recuperación
y cambio de contraseña. Es UX y no sustituye al proveedor. No se agrega hashing.

1. Abrir el proyecto en Supabase Dashboard → Authentication → Sign In / Providers
   (o Providers) → Email.
2. Mantener habilitado Email y Confirm email.
3. Establecer Minimum password length en 10.
4. En Password requirements elegir minúsculas, mayúsculas, dígitos y símbolos.
   Esta es la política que informó configurada el propietario del proyecto.
5. Probar en el proyecto de pruebas un registro directo con contraseña débil
   y comprobar que Auth lo rechaza, independientemente del formulario.

La interfaz no impone nuevas restricciones al login de cuentas existentes.
La recuperación/cambio de contraseña y su checklist aún no están implementados.
Referencia: https://supabase.com/docs/guides/auth/password-security

### Etapas pendientes, no presentarlas como activadas

CAPTCHA: frontend implementado; requiere la activación manual documentada debajo.
Rate limiting: combinar límites oficiales
de Auth con almacenamiento persistente para APIs/RPC; no usar Map por instancia
ni bloqueos permanentes. Estos servicios no fueron configurados automáticamente.

Headers: preparar CSP en Report-Only y probar scripts, imágenes, Supabase y
Turnstile antes de exigirla; agregar protección de framing, nosniff, Referrer-Policy
y Permissions-Policy. CSP complementa, no reemplaza, validación y escape de texto.
Los secretos permanecen en variables privadas, sin NEXT_PUBLIC_; .env.local está
ignorado y .env.example solo contiene nombres y valores vacíos. No usar service_role.

Este documento diferencia controles existentes de tareas pendientes; no certifica
la configuración remota ni sustituye las pruebas de regresión y seguridad.

### Turnstile: configuración manual y activación

La aplicación ofrece email/contraseña y Google OAuth. El botón Apple fue retirado;
no se modifican proveedores ni identidades existentes en Supabase remotamente.
Turnstile.jsx es reutilizable: recibe onToken (setter estable) y entrega un token
temporal, nunca una autorización. AuthForm envía options.captchaToken a signUp y
signInWithPassword. Supabase valida el token con Cloudflare mediante su integración
oficial. Google OAuth no depende de este token. No se implementa recuperación aún.

1. Crear en Cloudflare → Turnstile → Add widget: nombre Elite Club - Desarrollo,
   modo Managed y hostnames localhost y 127.0.0.1 (sin protocolo, puerto ni ruta).
   No habilitar pre-clearance. Guardar la Site Key y la Secret Key por separado.
2. Colocar únicamente la Site Key pública en .env.local:
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY=TU_SITE_KEY_PUBLICA`. Reiniciar Next. La copia
   versionada .env.example contiene únicamente el nombre vacío. No se necesita
   ninguna variable privada de Turnstile en Elite Club.
3. Antes de habilitar CAPTCHA en Supabase, verificar que el widget carga en login
   y registro, emite una verificación válida y Google sigue funcionando.
4. Recién entonces abrir Supabase → Authentication → Bot and Abuse Protection →
   Enable CAPTCHA protection → Cloudflare Turnstile. Pegar allí exclusivamente
   la Secret Key del mismo widget y guardar. No enviarla por chat ni registrarla.
5. Probar registro, confirmación y login reales; comprobar que el proveedor rechaza
   solicitudes sin token o con token inválido. La protección real depende de este
   paso remoto: la comprobación del navegador por sí sola no protege Auth.

Si falta la Site Key, el login/registro con contraseña quedan bloqueados con un
mensaje de configuración; Google y el catálogo siguen disponibles. Si se bloquea
el script, no se permite continuar con contraseña. Cada intento a Auth elimina el
desafío anterior y crea uno nuevo. Expiración/timeout invalidan el token y resetean
el widget; los errores tienen un reintento automático limitado y botón de reintento
para evitar ciclos. Los tokens viven solo en memoria: no van a metadata, logs ni
almacenamiento del navegador. Se eliminan al cambiar de modo o cerrar el modal.

La recuperación futura reutilizará Turnstile y enviará captchaToken a
resetPasswordForEmail; esa funcionalidad no se añade en esta etapa. No se cambian
cookies, CSRF, headers, RLS, migración 007 ni integraciones de pagos.

Pruebas: `npx playwright test --config=playwright.security.config.js tests/auth.spec.js tests/security.spec.js`.
Esa configuración usa una Site Key ficticia solo en el servidor de pruebas y
los tests interceptan el script de Cloudflare y Auth: no resuelven CAPTCHA real,
no crean cuentas, no envían emails y no habilitan nada remotamente. Verifican envío
de token, rechazo, expiración, errores, reintentos, checklist y Google sin CAPTCHA.
El dueño comprobó el widget y el acceso real en el dominio de Production después del despliegue. Las pruebas automatizadas siguen usando dobles de Cloudflare y Auth.

Referencias: https://supabase.com/docs/guides/auth/auth-captcha y
https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/.

### Rate limiting persistente — migración 008 ya presente en Supabase

`008_rate_limiting.sql` está aplicada en Supabase Production: los flujos de pedido,
checkout y administración protegidos por sus RPC funcionaron después del despliegue.
La secuencia activa es
`001 → 002 → 003 → 004 → 005 → 006 → 007_products_price → 008_rate_limiting → 009 → 010 → 011 → 012`.
El número 007 se utiliza ahora para formalizar `products.price`, no para USD/ARS.
008 requiere la base con 001–007. Las APIs de esta versión
requieren las nuevas RPC de 008.

La antigua propuesta `007_order_currency_amba.sql`, nunca ejecutada, se conserva
íntegra en [supabase/drafts/order_currency_amba.sql](supabase/drafts/order_currency_amba.sql).
`supabase/drafts/` queda fuera de la secuencia activa: no debe incluirse en runners
de migraciones ni ejecutarse automáticamente. Solo `supabase/migrations/` contiene
las migraciones activas. El borrador conserva sus comentarios históricos sobre 007;
eso no lo convierte en una migración vigente.

La conversión visual USD/ARS y el cobro ARS desde precios base USD se implementan
con `012`. Si se implementa AMBA, se necesitará una migración posterior a `012`,
reconciliada con el rate limiting y la confirmación de pagos.
No se debe copiar el borrador directamente a migrations ni ejecutarlo tal como está.
En una instalación nueva que omita 008, las lecturas privadas, checkout y CRUD
administrativo pueden responder error de configuración/503: fallan cerrados,
sin intentar escritura directa ni saltarse cuotas. Aplicar las migraciones en orden.

El SQL completo está en `supabase/migrations/008_rate_limiting.sql`. No usa secretos,
`service_role`, Redis ni otro servicio. Auth conserva los límites oficiales de
Supabase y Turnstile; `authMessage` ya convierte errores 429 del proveedor en mensajes
genéricos. No hay contadores por email, bloqueos permanentes ni cambios de OAuth.

| Operación | Ventanas fijas por identidad verificada |
| --- | --- |
| Crear pedido | 5/10 minutos y 20/hora |
| Iniciar Checkout | 5/10 minutos por usuario y 3/5 minutos por pedido propio |
| Crear/editar/eliminar producto | 30/minuto compartidos por admin |
| Eliminar producto | Además, 10/10 minutos por admin |
| GET de pedidos y productos en admin mediante Next | 60/minuto compartidos por usuario |
| AMBA futura, no implementada | 10/minuto y 50/hora |

No hay cuota persistente para catálogo ni delivery-options. No se implementa límite
por IP en esta etapa: no se confía en `X-Forwarded-For` enviado libremente por el cliente.
La identificación fiable del proxy y la protección por IP se evaluarán cuando se
defina el despliegue, sin cambiar ahora headers/cookies/CSRF.

**Permisos y bypass.** `elite_security` es privado, sin acceso de `anon` ni
`authenticated`. Las reglas, ventanas, reloj e identidad se fijan dentro del servidor;
el usuario no puede leer/resetear contadores ni elegir otro UUID o límite.
`elite_create_order(jsonb,jsonb)` pasa a ser un wrapper público: mueve la implementación
006 íntegra a `elite_security.create_order_006`, revoca su EXECUTE y consume cuota
antes de llamarla. Una llamada directa desde Supabase también queda limitada.

Las nuevas RPC `elite_admin_create_product`, `elite_admin_update_product` y
`elite_admin_delete_product` verifican `auth.uid()` y el rol actual de `profiles`,
consumen cuota y validan datos antes del CRUD. Las rutas Next conservan su verificación
independiente y los mismos contratos de respuesta que usa `/admin`. Se revocan
INSERT/UPDATE/DELETE de products para PUBLIC/anon/authenticated (también grants por
columna conocidos), conservando SELECT público y RLS. No se cambia `profiles.role`.
Las funciones públicas son SECURITY DEFINER, con search_path vacío; los helpers
privados no necesitan privilegios propios adicionales. Ejecutar manualmente como postgres.

`elite_checkout_quota(uuid)` comprueba propietario (también para admin), pending,
entrega e importes antes de consumir ambas cuotas. La API valida también los datos
y APP_URL/token del servidor, confirma la llamada RPC y recién después hace fetch a MP.
Una falla del proveedor conserva ese consumo ya confirmado. Llamar la RPC directamente
solo puede consumir cuota propia: no crea una Preference ni permite agotar cuota ajena.
`elite_consume_read_quota('orders'|'admin')` protege los GET propios; verifica admin
para esa área. No permite configurar límites arbitrarios.

**Persistencia y transacciones.** El incremento sucede antes de un bloque interno
`BEGIN ... EXCEPTION ... END` que contiene la operación de negocio. Ante un error
capturable se revierte solo ese bloque, se devuelve un error público seguro y se
confirma la transacción exterior junto con el contador. No se vuelve a hacer RAISE.
Esto NO es una transacción autónoma.

| Resultado | Cuota |
| --- | --- |
| Bloqueado por una ventana | No incrementa ninguna ventana; no prolonga bloqueo |
| No autenticado/no admin/pedido ajeno | No consume |
| JSON malformado, tipo UUID inválido o validación rechazada antes de llegar a la RPC | No consume |
| Datos de negocio inválidos dentro de RPC de pedidos/admin | Consume si había cuota |
| Pedido inválido para checkout | No consume; se valida antes |
| Operación exitosa | Consume |
| Error interno capturado en negocio de pedidos/admin | Consume; negocio revertido |
| Error de Mercado Pago después de cuota confirmada | Consume |
| Cancelación, caída o rollback de toda la transacción PostgreSQL | Puede revertir cuota; no se garantiza persistencia |

Un error del propio limitador bloquea la operación. `WHEN OTHERS` no captura todas
las cancelaciones de consultas. Antes de activar, verificar que PostgREST confirme
normalmente transacciones y **no tenga habilitado `Prefer: tx=rollback` para clientes**.
La suite local demuestra tanto el error interno con cuota conservada como el rollback
exterior que la elimina. No se agregan extensiones para simular commits autónomos.

**HTTP.** La RPC devuelve JSON con `code: PT429`, establece `response.status=429` y
`response.headers` con Retry-After. No lanza excepción para responder ese estado.
`details` contiene únicamente el JSON textual `{ "retry_after": segundos }`, porque
supabase-js conserva esa propiedad. `src/lib/rateLimit.js` valida que sea un entero
entre 1 y 3600 y lo convierte al header de Next, con mensaje genérico. Nunca retorna
SQL, mensajes internos del proveedor ni stack traces. El helper también rechaza
respuestas PTxxx aunque un transporte incorrecto las entregara como HTTP 200.

**Concurrencia y limpieza.** Un advisory lock transaccional por usuario serializa
la verificación de sus reglas. UPSERT bloquea cada fila; todas las ventanas deben
pasar antes de incrementar cualquiera. Se elimina oportunistamente un máximo de
100 contadores vencidos por llamada, usando índice de vencimiento y SKIP LOCKED.
Las filas activas no se borran. Sin tráfico no hay limpieza, pero tampoco crecimiento.

**Compatibilidad obligatoria del borrador USD/ARS + AMBA con 008.** No ejecutar
`supabase/drafts/order_currency_amba.sql` tal como está: elimina
`elite_create_order(jsonb,jsonb)` y crea otra firma sin estas cuotas. Antes de usarla,
reconciliar SQL y API para que la nueva RPC conserve, después de autenticar y fuera
del bloque de negocio que maneja errores, exactamente:

```sql
v_retry := elite_security.consume('order_create');
if v_retry > 0 then
  return elite_security.failure(429, v_retry);
end if;
begin
  -- Toda la validación y creación atómica de la futura migración posterior a 008.
exception when others then
  return elite_security.business_failure(SQLSTATE);
end;
```

Declarar `v_retry integer`, revocar cualquier firma pública vieja y no exponer una
entrada sin cuota. El futuro `elite_checkout_order(uuid)` deberá conservar propiedad
y validaciones del borrador reconciliado, y llamar una sola vez a
`elite_security.consume('checkout', p_order_id::text)` después de validar y antes
de autorizar MP, devolviendo `failure(429, v_retry)` si corresponde. Reemplazar entonces
el consumo de `elite_checkout_quota` en Next para no contar dos veces. Se conservó
íntegro el contenido del borrador; la conversión USD es sólo visual, AMBA no está implementada y el webhook ARS está preparado en `010_payment_webhooks.sql`.

**Pruebas locales y activación posterior.**

- `npm run test:rate-limit`: PostgreSQL embebido descartable (PGlite), migraciones
  001–008 activas, privilegios reales, cuotas, vencimiento, atomicidad y respuestas.
  Validación local 2026-10-19: 18 pruebas aprobadas, incluida la secuencia completa
  y la conservación de datos al aplicar 007→008 con price numeric o numeric(12,2).
  No se ejecutó ninguna migración remota.
- `npx playwright test --config=playwright.admin.config.js`: rutas Next y CRUD de
  interfaz contra backend ficticio local; incluye 429/Retry-After y ausencia de llamada
  a MP cuando bloquea. La fixture no es un limitador ni se usa en producción.
- PGlite serializa consultas; su ráfaga Promise.all **no prueba conexiones PostgreSQL
  paralelas reales**. Antes de activar, falta repetir en una base descartable local con
  PostgreSQL/PostgREST: 20 POST RPC simultáneos del mismo usuario (5 éxitos, 15 con 429,
  ambos contadores en 5), dos usuarios simultáneos (5 éxitos cada uno), y checkout
  simultáneo (3 por pedido/5 por usuario). Ejecutar lejos del borde de ventana.
  Comprobar también que los errores 400/500 capturados confirman el contador vía HTTP.

Después de revisar/aprobar el SQL y esa prueba, coordinar una pausa breve de las
operaciones privadas, aplicar manualmente 008 y activar esta versión de las APIs
juntas. Verificar CRUD, pedidos, 429 y Retry-After. No ejecutar únicamente el SQL
contra una versión vieja que todavía escriba products directamente. No se ejecutó
ninguna migración remota durante esta implementación.

Limitaciones: ventanas fijas permiten ráfagas en el cambio de ventana; no hay bloqueo
permanente. RLS sigue protegiendo lecturas directas a Supabase, pero el límite de GET
de Next no limita esas consultas directas. Esto no es protección DDoS ni evita abuso
con múltiples cuentas. Cada solicitud limitada aún consulta PostgreSQL; no evita
agotamiento de conexiones. No garantiza idempotencia ni impide varias Preferences
permitidas para un mismo pedido. No se retiran estas limitaciones mediante claims
del navegador ni se promete seguridad absoluta.

Referencias transaccionales: https://docs.postgrest.org/en/stable/references/transactions.html
y https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING.

### 007_products_price — nota histórica del esquema previo a 012

La nueva migración crea `price numeric` si falta, exige NOT NULL, sin default,
positivo, finito, máximo 9999999999.99 y hasta dos decimales. Se usa numeric sin
escala fija para rechazar, en lugar de redondear, fracciones adicionales. Si la columna
ya existe como numeric (incluido numeric(p,s)), no cambia su tipo ni precisión:
las reglas de almacenamiento del tipo existente se conservan. Si es otro tipo,
aborta sin convertirlo. No se conoce el DDL remoto exacto a partir de estos archivos.

No contiene INSERT, UPDATE ni DELETE. Elimina únicamente el default del campo,
establece restricciones y un comentario; conserva valores, otras restricciones,
RLS, permisos y pedidos. Un precio existente NULL o incompatible hace fallar la
transacción completa, sin reemplazos ni redondeo. No agrega índices porque las
consultas actuales no filtran ni ordenan por precio. No es un script para ejecutar
repetidamente: el runner debe registrar cada migración aplicada.

En una base vacía con los esquemas/roles estándar de Supabase, aplicar primero
001–008 y después importar productos incluyendo precios reales. 005/006 definen
funciones PL/pgSQL que consultan price al invocarse: no deben llamarse antes de 007.
La secuencia completa se ejecutó correctamente en PGlite descartable, con los roles
y auth.uid() reproducidos localmente. Las RPC y permisos se verificaron después de
008. Esto no sustituye verificar el DDL remoto ni prueba concurrencia PostgreSQL
con conexiones independientes.

`supabase/seed.sql` y su generador histórico no incluyen precios. No ejecutarlos
como carga completa después de 007, ni inventar precios para hacerlos pasar:
preparar una importación con todos los campos actuales y price desde una fuente real.
Tampoco basta su ON CONFLICT para omitir un campo obligatorio.
Si ya se cargaron productos sin price, hay que preparar la columna nullable y cargar
sus precios reales explícitamente antes de volver a intentar 007. Esta migración
se detiene en ese estado; nunca deja una aplicación operativa con precios ficticios.

El borrador `supabase/drafts/order_currency_amba.sql` permanece intacto y excluido
de las migraciones activas. Su reconciliación futura corresponderá a una migración posterior a `012`.

**Moneda de cobro.** La migración `012_usd_base_ars_orders.sql` documenta
`products.price` como precio base USD, conserva los snapshots históricos ARS y
convierte los pedidos nuevos a ARS con una cotización MEP verificada. Mantiene
el rate limiting de `008` y no aplica el borrador AMBA.

**Verificación remota pendiente, solo lectura.** El código admite numeric sin escala
o numeric(p,s) compatible; no permite deducir el tipo remoto exacto. Antes de aprobar
la igualdad del esquema nuevo y el actual, ejecutar manualmente:

```sql
select data_type, numeric_precision, numeric_scale, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name = 'price';
```

Si devuelve precision/scale diferentes de NULL/NULL, revisar la declaración de la
columna nueva de 007 antes de ejecutarla: conservar el tipo existente no garantiza
que coincida con la declaración usada en una instalación limpia. No cambiar tipos
ni redondear datos automáticamente. 007 elimina el default y fija NOT NULL; esas
son modificaciones intencionales de metadatos, sin sobrescribir precios.

**Importación válida después de 007/008, exclusivamente para una base vacía.**

1. Preparar `products-with-prices.csv` con datos reales de una fuente confiable y
   esta cabecera, en este mismo orden:
   `id,name,size,brand,type,image,sort_order,price`.
   Conservar los IDs y el orden del inventario; completar cada precio base real en USD.
   Usar punto decimal, sin símbolo monetario ni separadores de miles, y hasta dos
   decimales. No usar products.json como fuente de precios ni completar faltantes.
2. En una sesión psql conectada explícitamente a la base destino, con el rol de
   mantenimiento autorizado (no el usuario authenticated de la aplicación), ejecutar
   manualmente lo siguiente. La ruta del CSV es local a psql; ajustarla si corresponde:

```text
\set ON_ERROR_STOP on
BEGIN;
\copy public.products (id,name,size,brand,type,image,sort_order,price) FROM 'products-with-prices.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
COMMIT;
```

No requiere service_role ni cambia los permisos del frontend. Las restricciones
rechazan precios faltantes/inválidos e IDs duplicados; no hay upsert, reemplazos ni
borrado. Ante error, hacer ROLLBACK antes de corregir y reintentar. No usar este
procedimiento para volver a importar la base actual ya poblada. Ninguna importación
ni conexión remota fue ejecutada por las pruebas; utilizan solo datos ficticios
aislados en la base de test. La carga con todos los campos y price se verifica en
el fixture de la secuencia limpia, y se comprueba el rechazo si se omite price.
