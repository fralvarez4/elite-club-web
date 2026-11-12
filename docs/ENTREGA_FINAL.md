# Entrega final — Elite Club

Estado al 12/11/2026. El [PR #1](https://github.com/fralvarez4/elite-club-web/pull/1) está integrado en `main` y la web está publicada en [eliteclubstore.vercel.app](https://eliteclubstore.vercel.app/). Este documento distingue pruebas automatizadas, comprobaciones hechas por el dueño en servicios externos y funciones aún no probadas con dinero real.

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
| E1 Repo, CI/CD y preview PR | [PR #1 integrado](https://github.com/fralvarez4/elite-club-web/pull/1), [CI verde en `main`](https://github.com/fralvarez4/elite-club-web/actions/runs/43141080351) y [preview Vercel exitoso](https://vercel.com/franco-fc75/elite-club-web/38KTYYibaVRC8HL9Pt7Ycagagk55) | Preview sin variables propias de Supabase y Turnstile: sólo permitió comprobar interfaz y carrito |
| E2 Landing responsive | UI probada en escritorio y móvil | Validación manual final de accesibilidad |
| E3 Formularios dinámicos | Auth, perfil, entrega y admin con validaciones y fetch probados; acceso y pedido reales comprobados en Production | Recorrido manual adicional de edición de perfil si se exige evidencia visual |
| E4 Catálogo y API | Catálogo/API probados; checklist en PR; productos y precios reales visibles en Production | Ningún bloqueo conocido |
| E5 Supabase y admin | CRUD/RLS probado localmente; migraciones aplicadas; cuenta admin creada y producto temporal creado, editado, visto en catálogo y eliminado en Production | Ningún bloqueo conocido |
| E6 Checkout y webhook | Pedido USD→ARS, Checkout Pro y pago de prueba aprobados; simulador oficial de Mercado Pago respondió 200; el dueño confirmó `payment_events` y pedido `approved` y mensaje de confirmación en la web | No se han probado cobros reales ni entrega automática de notificaciones de producción |
| Transversales | Código, UI, CI y despliegue público revisados; esta guía documenta la evidencia | Presentar demo pública y defensa técnica |

El código incluye catálogo, filtros, variantes, carrito, favoritos, autenticación Supabase, perfiles, administración protegida, pedidos con importes calculados por RPC y checkout de Mercado Pago. Los recorridos principales se verificaron en la web publicada con credenciales de prueba; la aceptación de pagos reales permanece fuera del alcance de esta prueba.

La siguiente matriz reúne la evidencia técnica por área, sin asignar una nota a pruebas aún no ejecutadas en producción:

| Área | Evidencia local | Pendiente externo |
| --- | --- | --- |
| Catálogo, búsqueda, filtros y variantes | Pruebas de UI y lectura de Supabase simulada | 74 precios USD y catálogo real comprobados por el dueño |
| Carrito y favoritos | CRUD, persistencia y vista móvil en Playwright | Ninguno para uso local |
| Auth y perfil | Flujos de Email/OAuth simulados, RLS y edición de contacto en PGlite; `009` aplicada | Acceso real confirmado en Production; edición de perfil aún sin evidencia manual final |
| Administración | Validación, roles, CRUD y revocación en pruebas HTTP simuladas | Rol admin y CRUD completo comprobados en Production con producto temporal eliminado |
| Pedidos y entrega | RPC, importes, snapshot, propiedad y límites probados localmente | Pedido real de prueba creado con total ARS fijo; tarifas de retiro/envío en cero según el dueño |
| Pagos | Firma, consulta al proveedor simulado, vendedor, importe, preferencia única e idempotencia probados localmente; `010`–`012` aplicadas | Pago de prueba aprobado; webhook simulado respondió 200 y actualizó el pedido según consulta SQL del dueño |
| Moneda | Catálogo USD, visualización ARS indicativa, pedido ARS con cotización MEP guardada y pago ARS; `012` aplicada | Precios USD y total ARS real comprobados en Production |
| Accesibilidad y responsive | Controles con etiquetas, diálogos, teclado y revisión 1440/390 px | Revisión manual adicional con lector de pantalla si la rúbrica la exige |
| Despliegue | Build y CI de `main` pasan | Vercel Production activo en HTTPS; catálogo, auth, admin y pago de prueba comprobados |

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
- [GitHub Actions en `main`](https://github.com/fralvarez4/elite-club-web/actions/runs/43141080351): lint, build, rate limit, 85 pruebas principales y pruebas HTTP de administración pasaron tras integrar el PR.
- En Production, el dueño comprobó inicio de sesión, precios USD, cotización y pedido ARS, creación de Preference, pago con comprador y tarjeta de prueba, respuesta 200 del simulador de Webhooks de Mercado Pago, pedido y evento `approved` con importes iguales en Supabase, y mensaje “Pago confirmado por Mercado Pago” en la web.
- Se creó una cuenta admin dedicada; desde `/admin` se creó un producto temporal, se editó su precio, se comprobó el nuevo precio en el catálogo público y se eliminó el producto. El dueño confirmó que desapareció del panel.
- Se abrió la app en Microsoft Edge a 1440×900 y 390×844. El catálogo, encabezado, selector de moneda y tarjetas se renderizaron; 12 tarjetas visibles y ningún desborde horizontal (`scrollWidth` igual al viewport en ambos tamaños). Capturas locales de revisión en `test-results/visual-desktop.png` y `test-results/visual-mobile.png` (directorio ignorado por Git).

## Decisiones técnicas

El dueño confirmó que los 74 valores de `products.price` provienen de una lista en USD. La implementación anterior y los comentarios de `007` los interpretaban como ARS. La migración `012` corrige la semántica de los productos y reemplaza la creación de pedidos para convertir cada precio unitario con la cotización MEP venta; conserva los pedidos previos como `legacy_ars` sin alterar sus importes. El borrador `supabase/drafts/order_currency_amba.sql` sigue excluido: no está reconciliado con la implementación actual.

Se usa [DolarAPI, Dólar Bolsa](https://ar.dolarapi.com/docs/argentina/operations/get-dolar-bolsa) para la tasa MEP de venta. La verificación del webhook sigue el [manifiesto HMAC y consulta de pagos descritos por Mercado Pago](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications). Las notificaciones no son fuente de importes: el servidor obtiene el pago autenticándose ante Mercado Pago y la RPC comprueba su importe contra el pedido.

## Configuración externa y límites de verificación

- Codex no se conectó directamente a Supabase remoto ni al panel de Mercado Pago. El dueño ejecutó manualmente las migraciones `009`, `010`, `011` y `012` en Supabase Production desde SQL Editor; informó `Success` en cada una. Sólo se usaron cuentas y tarjeta de prueba de Mercado Pago; no se verificaron cobros reales.
- Antes de las migraciones, el dueño verificó 74 productos con precios base USD y ningún precio nulo/no positivo. Había cinco pedidos de prueba `pending`, ninguno aprobado, con importes 40–255 interpretados antes como ARS. El código nuevo rechaza el Checkout de pedidos `legacy_ars`. Después se creó un pedido nuevo con total ARS 63.132 y se realizó un pago de prueba aprobado. El dueño confirmó que el pedido y su evento de pago quedaron `approved` tras la notificación simulada.
- El dueño comprobó que el Site URL y las dos redirect URLs del dominio `eliteclubstore.vercel.app` están configurados en Supabase; Email y Google figuran habilitados. Los métodos de envío y retiro están activos con costo cero; el dueño indicó que sus datos concretos no son relevantes para la evaluación.
- El sitio público está en Vercel; el dueño confirmó la presencia de `APP_URL`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` y `MERCADOPAGO_COLLECTOR_ID` en Production, además de `SUPABASE_SERVICE_ROLE_KEY`. No pudo revelar los valores por la verificación de Vercel, pero el flujo de prueba recorrió el dominio público y el webhook aceptó la simulación. El preview carece de variables de Supabase y Turnstile en el entorno Preview: muestra el catálogo de respaldo sin precios y no permite probar acceso real. Esta limitación no se observó en Production.
- En Checkout Pro vía Preferences API, Mercado Pago indica que los pagos hechos con credenciales de prueba no envían notificaciones automáticas. La recepción del webhook se probó con el simulador oficial usando el ID del pago aprobado. El primer intento con el ID de ejemplo `123456` devolvió 502; el intento con el ID real devolvió 200 y produjo el estado `approved` según el dueño. Esto no prueba la entrega automática de notificaciones en modo de cobro real.

### Checklist único de Vercel y Mercado Pago

En **Vercel → proyecto de `eliteclubstore.vercel.app` → Settings → Environment Variables**, configurar **Production**. Guardar secretos como **Secret**. No pegar valores de claves en chats, capturas, Git ni variables `NEXT_PUBLIC_`. Las variables guardadas sólo llegan a un despliegue nuevo.

| Variable | Estado conocido | Valor esperado u origen |
| --- | --- | --- |
| `APP_URL` | Existe, valor no verificable por el dueño | `https://eliteclubstore.vercel.app` sin ruta, query ni fragmento; confirmar o corregir con miembro verificado de Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Existe | URL del proyecto **Elite Club Web** en Supabase → Connect/Settings → API Keys; comparar con el proyecto donde se aplicaron `009`–`012` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existe | Publishable key `sb_publishable_...` del mismo proyecto Supabase |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Existe y el dueño comprobó el widget en Production | Site key pública de Turnstile para el dominio publicado |
| `SUPABASE_SERVICE_ROLE_KEY` | Guardada en Production | Secret key `sb_secret_...` de ese proyecto Supabase; sólo servidor |
| `MERCADOPAGO_ACCESS_TOKEN` | Existe; permitió crear una Preference y consultar el pago de prueba | Token de la aplicación vendedora de Checkout Pro **Preferences** |
| `MERCADOPAGO_WEBHOOK_SECRET` | Presente en Production; simulación firmada aceptada con HTTP 200 | Firma secreta de **Configuración de Webhooks** de la misma aplicación y del entorno elegido; sólo servidor |
| `MERCADOPAGO_COLLECTOR_ID` | Presente en Production; pago de prueba aceptado por el webhook | ID numérico de la cuenta vendedora asociada al token |

En **Mercado Pago Developers → Tus integraciones**, el responsable debe abrir la aplicación vinculada al token existente y confirmar **Checkout Pro + Preferences**. En **Configuración de Webhooks**, seleccionar el entorno de prueba y el evento **Payments**, configurar `https://eliteclubstore.vercel.app/api/v1/payments/webhook`, guardar y copiar la firma secreta directamente a Vercel. Configurar el ID de vendedor de la misma cuenta. No combinar token, firma y vendedor de aplicaciones o entornos distintos. El Checkout del código falla cerrado mientras falten estas variables.

Secuencia completada: PR con CI verde, variables de Production, merge a `main`, despliegue Vercel, catálogo y acceso reales, administración CRUD, pedido USD→ARS, pago con comprador de prueba y simulación de webhook con pedido `approved`. Para la entrega académica sólo queda preparar la demo y presentar enlaces y evidencia. Antes de aceptar cobros reales, revisar credenciales productivas y validar entrega automática de notificaciones con una transacción real autorizada.

### Recuperación de una Preference incierta

Si Checkout devuelve 409 porque la Preference permanece en `creating`, identificar `order_id` en `checkout_preferences`. Revisar en el panel/API de Mercado Pago si existe una Preference o un pago con ese `external_reference`. Si existe, registrar su `id` y `init_point` verificados mediante una operación administrativa controlada; si hay pago, reconciliarlo con el registro del webhook. Sólo si se confirma que Mercado Pago no creó Preference ni recibió pago, eliminar esa fila específica para permitir un nuevo intento. Registrar la investigación y el cambio. No hacer limpieza automática por tiempo: una respuesta perdida puede corresponder a una Preference válida.

## Guion de demo y defensa técnica

1. Mostrar el catálogo público en escritorio y móvil: búsqueda, filtros, variantes, favoritos y carrito.
2. Iniciar sesión, completar/editar perfil y revisar cómo se autocompleta la entrega sin bloquear cambios para el pedido actual.
3. Mostrar el precio base USD y la conversión ARS indicativa. Explicar que el servidor obtiene MEP venta y que la RPC guarda una cotización y los importes ARS fijos en el pedido.
4. Mostrar el pedido de prueba ya creado, su total ARS fijado antes de Checkout Pro y la compra de prueba aprobada. Evitar crear otro pedido para la demo si no hace falta.
5. Mostrar la simulación oficial del webhook (HTTP 200), `payment_events` y `orders.status = approved` en Supabase y el mensaje de confirmación en la web. Repetir la notificación sólo si se necesita demostrar idempotencia y con el mismo ID real; no afirmar que el retorno del navegador por sí solo confirma el pago.
6. Mostrar el panel admin, permisos RLS y evidencia del producto temporal creado, editado, visto en catálogo y eliminado. Explicar que los pedidos conservan sus precios históricos.
7. Abrir el [PR #1](https://github.com/fralvarez4/elite-club-web/pull/1), [CI verde en `main`](https://github.com/fralvarez4/elite-club-web/actions/runs/43141080351) y el despliegue público. El preview por rama no tuvo variables propias de Supabase/Turnstile; la prueba funcional se hizo en Production.
