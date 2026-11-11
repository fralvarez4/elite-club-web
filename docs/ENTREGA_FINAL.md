# Entrega final — Elite Club

Estado al 11/11/2026. Este documento distingue código local de integraciones verificadas en servicios externos.

## Plan priorizado

1. Corregir el flujo de pago: confirmación autenticada, importes verificados e idempotencia.
2. Completar edición de perfil, datos de contacto y dirección, y autocompletado del checkout.
3. Tratar los precios confirmados como USD y convertir los pedidos a ARS con cotización MEP reciente, sin asignar cotizaciones ficticias.
4. Ejecutar lint, build, pruebas automatizadas y recorridos visuales; corregir fallas.
5. Preparar migraciones y pasos de despliegue. Las migraciones remotas y cobros reales requieren autorización del dueño.

## Rúbrica y alcance verificado

La URL obligatoria `https://indexitba.estebanpiazza.com.ar/grilla.html` no respondió desde este entorno. El dueño proporcionó el texto completo de la rúbrica: E1–E6 y cinco criterios transversales. Cada ítem requiere nivel Excelente (4).

| Criterio | Estado verificable | Falta para Excelente |
| --- | --- | --- |
| E1 Repo, CI/CD y preview PR | Repositorio local; workflow CI y plantilla PR preparados | Commit, ejecución verde en GitHub y preview Vercel por PR |
| E2 Landing responsive | UI probada en escritorio y móvil | Validación manual final de accesibilidad |
| E3 Formularios dinámicos | Auth, perfil, entrega y admin con validaciones y fetch probados | Recorrido real con Supabase desplegado |
| E4 Catálogo y API | Catálogo y APIs probados; plantilla checklist PR preparada | Usar checklist en PR y verificar despliegue |
| E5 Supabase y admin | CRUD/RLS probado localmente; migraciones `009`–`012` aplicadas por el dueño | Verificar admin real tras desplegar |
| E6 Checkout y webhook | Integración local simulada y tests de idempotencia | Configurar Mercado Pago, desplegar y probar un pago de prueba real |
| Transversales | Código, UI y documentación revisados localmente | Demo pública y defensa técnica tras despliegue |

El código incluye catálogo, filtros, variantes, carrito, favoritos, autenticación Supabase, perfiles, administración protegida, pedidos con importes calculados por RPC y checkout de Mercado Pago. Su funcionamiento real depende de migraciones y credenciales externas aún no verificadas.

La siguiente matriz reúne la evidencia técnica por área, sin asignar una nota a pruebas aún no ejecutadas en producción:

| Área | Evidencia local | Pendiente externo |
| --- | --- | --- |
| Catálogo, búsqueda, filtros y variantes | Pruebas de UI y lectura de Supabase simulada | Confirmar seed y precios reales en Supabase |
| Carrito y favoritos | CRUD, persistencia y vista móvil en Playwright | Ninguno para uso local |
| Auth y perfil | Flujos de Email/OAuth simulados, RLS y edición de contacto en PGlite; `009` aplicada | Probar acceso real tras desplegar |
| Administración | Validación, roles, CRUD y revocación en pruebas HTTP simuladas | Confirmar rol administrador y `008` en Supabase real |
| Pedidos y entrega | RPC, importes, snapshot, propiedad y límites probados localmente | Confirmar `005`–`008`, tarifas y precios reales |
| Pagos | Firma, consulta al proveedor simulado, vendedor, importe, preferencia única e idempotencia probados localmente; `010`–`012` aplicadas | Configurar Webhooks y probar un pago de prueba real |
| Moneda | Catálogo USD, visualización ARS indicativa, pedido ARS con cotización MEP guardada y pago ARS; `012` aplicada | Verificar conectividad a DolarAPI y probar en Supabase real |
| Accesibilidad y responsive | Controles con etiquetas, diálogos, teclado y revisión 1440/390 px | Revisión manual adicional con lector de pantalla si la rúbrica la exige |
| Despliegue | Build de producción pasa | Configurar variables y dominio HTTPS; probar servicio desplegado |

## Cambios realizados

- `009_profile_contact.sql`: agrega teléfono y dirección opcionales al perfil, conservando RLS y permisos de actualización por columna. La interfaz permite editar datos existentes y el checkout autocompleta todos los campos guardados; cada pedido conserva su propia entrega.
- `010_payment_webhooks.sql` y `/api/v1/payments/webhook`: verifican firma HMAC y antigüedad de la notificación, consultan el pago directamente en Mercado Pago, cotejan vendedor, referencia, moneda e importe y registran el pago una sola vez mediante clave única. Sólo `service_role` puede ejecutar la RPC; el usuario no puede cambiar el estado de un pedido.
- `011_checkout_preferences.sql`: reserva una sola Preference por pedido y la reutiliza en nuevos POST. Si Mercado Pago no confirma la respuesta o falla el registro local, el pedido queda en `creating` hasta reconciliación manual, para impedir otra Preference potencialmente duplicada.
- `012_usd_base_ars_orders.sql`: conserva pedidos históricos sin reinterpretarlos, identifica el catálogo como precio base USD y guarda cotización MEP, precio unitario USD y precio convertido ARS en cada pedido nuevo. El servidor obtiene la cotización de DolarAPI; sólo `service_role` puede guardarla y la RPC de pedidos calcula importes ARS. Si no hay cotización reciente, no se crea el pedido. La revisión muestra el total ARS fijo antes de redirigir al pago.
- El checkout se bloquea si faltan las variables de confirmación segura. El retorno del navegador consulta el pedido y sólo presenta “Pago confirmado” cuando Supabase contiene `approved`.
- Selector USD/ARS de visualización: muestra el precio base USD de la lista y, cuando hay cotización MEP reciente, su equivalente indicativo ARS. Los importes definitivos del pedido y de Mercado Pago se calculan y guardan en ARS.
- Se configuró el entorno de pruebas Playwright para Auth y Turnstile; se hizo la comparación del seed independiente de CRLF de Windows.

## Pruebas ejecutadas

Node/npm no estaban en `PATH` de la sesión. Se ejecutaron usando `C:\Program Files\nodejs\npm.cmd`.

- `npm run lint`: pasó.
- `npm run build`: pasó (Next.js 16.3.8, rutas nuevas incluidas).
- `npm run test:rate-limit`: 18/18 pasaron con la Preference única implementada.
- `npm test -- --workers=3 --reporter=line`: 85/85 pasaron, incluidas pruebas de la conversión USD→ARS, cotización y migración `012`.
- `npx playwright test --config playwright.admin.config.js`: 10/10 pasaron con servidor simulado de Supabase, DolarAPI y Mercado Pago, incluida la revisión del total ARS antes del pago.
- Los nuevos tests del webhook usan respuestas simuladas del proveedor y PostgreSQL local en PGlite. No son una prueba de una transferencia real.
- Se abrió la app en Microsoft Edge a 1440×900 y 390×844. El catálogo, encabezado, selector de moneda y tarjetas se renderizaron; 12 tarjetas visibles y ningún desborde horizontal (`scrollWidth` igual al viewport en ambos tamaños). Capturas locales de revisión en `test-results/visual-desktop.png` y `test-results/visual-mobile.png` (directorio ignorado por Git).

## Decisiones técnicas

El dueño confirmó que los 74 valores de `products.price` provienen de una lista en USD. La implementación anterior y los comentarios de `007` los interpretaban como ARS. La migración `012` corrige la semántica de los productos y reemplaza la creación de pedidos para convertir cada precio unitario con la cotización MEP venta; conserva los pedidos previos como `legacy_ars` sin alterar sus importes. El borrador `supabase/drafts/order_currency_amba.sql` sigue excluido: no está reconciliado con la implementación actual.

Se usa [DolarAPI, Dólar Bolsa](https://ar.dolarapi.com/docs/argentina/operations/get-dolar-bolsa) para la tasa MEP de venta. La verificación del webhook sigue el [manifiesto HMAC y consulta de pagos descritos por Mercado Pago](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications). Las notificaciones no son fuente de importes: el servidor obtiene el pago autenticándose ante Mercado Pago y la RPC comprueba su importe contra el pedido.

## Configuración externa y bloqueos

- Codex no se conectó directamente a Supabase remoto ni al panel de Mercado Pago. El dueño ejecutó manualmente las migraciones `009`, `010`, `011` y `012` en Supabase Production desde SQL Editor; informó `Success` en cada una. Aún no se habilitaron cobros reales.
- Antes de las migraciones, el dueño verificó 74 productos con precios base USD y ningún precio nulo/no positivo. Había cinco pedidos de prueba `pending`, ninguno aprobado, con importes 40–255 interpretados antes como ARS. Las migraciones `009`–`012` fueron informadas como aplicadas correctamente, pero aún no se hizo un pedido de prueba real con la nueva versión. El código nuevo rechaza el Checkout de pedidos `legacy_ars`.
- El dueño comprobó que el Site URL y las dos redirect URLs del dominio `eliteclubstore.vercel.app` están configurados en Supabase; Email y Google figuran habilitados. Los métodos de envío y retiro están activos con costo cero; el dueño indicó que sus datos concretos no son relevantes para la evaluación.
- El sitio público está en Vercel y el dueño ya tiene acceso a sus variables. `SUPABASE_SERVICE_ROLE_KEY` fue guardada en Production. `APP_URL` existe, pero su valor no puede verse sin verificación; se asume pendiente de comprobar. Tampoco tiene acceso a la aplicación de Mercado Pago. GitHub Actions registra cero ejecuciones porque el workflow nuevo no se ha subido.

### Checklist único de Vercel y Mercado Pago

En **Vercel → proyecto de `eliteclubstore.vercel.app` → Settings → Environment Variables**, configurar **Production**. Guardar secretos como **Secret**. No pegar valores de claves en chats, capturas, Git ni variables `NEXT_PUBLIC_`. Las variables guardadas sólo llegan a un despliegue nuevo.

| Variable | Estado conocido | Valor esperado u origen |
| --- | --- | --- |
| `APP_URL` | Existe, valor no verificable por el dueño | `https://eliteclubstore.vercel.app` sin ruta, query ni fragmento; confirmar o corregir con miembro verificado de Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Existe | URL del proyecto **Elite Club Web** en Supabase → Connect/Settings → API Keys; comparar con el proyecto donde se aplicaron `009`–`012` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existe | Publishable key `sb_publishable_...` del mismo proyecto Supabase |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Existe | Site key pública de Turnstile para el dominio publicado; comprobar que el widget funciona en login/registro |
| `SUPABASE_SERVICE_ROLE_KEY` | Guardada en Production | Secret key `sb_secret_...` de ese proyecto Supabase; sólo servidor |
| `MERCADOPAGO_ACCESS_TOKEN` | Existe, modo desconocido | Token de la aplicación vendedora de Checkout Pro **Preferences**; responsable de Mercado Pago debe confirmar si es de prueba o producción y que corresponde a esa aplicación |
| `MERCADOPAGO_WEBHOOK_SECRET` | Falta | Firma secreta de **Configuración de Webhooks** de la misma aplicación y del entorno elegido; sólo servidor |
| `MERCADOPAGO_COLLECTOR_ID` | Falta | ID numérico de la cuenta vendedora asociada al token; responsable de Mercado Pago debe obtenerlo y cargarlo, sin inventarlo |

En **Mercado Pago Developers → Tus integraciones**, el responsable debe abrir la aplicación vinculada al token existente y confirmar **Checkout Pro + Preferences**. En **Configuración de Webhooks**, seleccionar el entorno de prueba y el evento **Payments**, configurar `https://eliteclubstore.vercel.app/api/v1/payments/webhook`, guardar y copiar la firma secreta directamente a Vercel. Configurar el ID de vendedor de la misma cuenta. No combinar token, firma y vendedor de aplicaciones o entornos distintos. El Checkout del código falla cerrado mientras falten estas variables.

Secuencia de publicación: (1) completar/confirmar variables y webhook de prueba, (2) revisar diff y hacer commit/push autorizado, (3) esperar CI verde y despliegue Vercel, (4) probar catálogo, login, admin y pedido USD→ARS, (5) pagar sólo con comprador y credenciales de prueba, verificar `payment_events` y `orders.status = approved` una vez, (6) comprobar preview por PR y preparar la demo. No habilitar cobros reales hasta terminar las pruebas y recibir autorización.

### Recuperación de una Preference incierta

Si Checkout devuelve 409 porque la Preference permanece en `creating`, identificar `order_id` en `checkout_preferences`. Revisar en el panel/API de Mercado Pago si existe una Preference o un pago con ese `external_reference`. Si existe, registrar su `id` y `init_point` verificados mediante una operación administrativa controlada; si hay pago, reconciliarlo con el registro del webhook. Sólo si se confirma que Mercado Pago no creó Preference ni recibió pago, eliminar esa fila específica para permitir un nuevo intento. Registrar la investigación y el cambio. No hacer limpieza automática por tiempo: una respuesta perdida puede corresponder a una Preference válida.

## Guion de demo y defensa técnica

1. Mostrar el catálogo público en escritorio y móvil: búsqueda, filtros, variantes, favoritos y carrito.
2. Iniciar sesión, completar/editar perfil y revisar cómo se autocompleta la entrega sin bloquear cambios para el pedido actual.
3. Mostrar el precio base USD y la conversión ARS indicativa. Explicar que el servidor obtiene MEP venta y que la RPC guarda una cotización y los importes ARS fijos en el pedido.
4. Crear un pedido de prueba nuevo. Confirmar el total ARS antes de Checkout Pro. Usar sólo credenciales y comprador de prueba.
5. Verificar el webhook y el estado `approved` desde la base. Repetir la notificación para demostrar idempotencia. No afirmar que el retorno del navegador confirma el pago.
6. Mostrar el panel admin, permisos RLS, un cambio de precio USD y su reflejo en catálogo. Explicar que los pedidos conservan sus precios históricos.
7. Abrir el PR con checklist, CI verde y preview Vercel. Estos tres resultados requieren push y acceso a Vercel; todavía no están verificados.
