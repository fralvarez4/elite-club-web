# Configuración para desarrollo y despliegue

1. Ejecutar `npm ci` y copiar `.env.example` a `.env.local`.
2. En Supabase, usar un proyecto propio. Aplicar `001_products.sql`, luego `supabase/seed.sql` si se desea el catálogo inicial, y después `002` a `006` en orden. **Antes de `007`**, agregar `price numeric` a `public.products` si todavía no existe, cargar los precios reales de la lista USD autorizada y comprobar que no haya valores nulos, cero o negativos. `007` aborta si faltan precios. Luego aplicar `007` a `012` en orden. El seed conserva nombres, imágenes y orden, pero **no contiene precios**; un proyecto recién creado no queda listo para pedidos sin esa lista. No repetir el seed sobre productos editados: actualiza las filas de origen.
3. Completar la URL y Publishable Key de Supabase. `SUPABASE_SERVICE_ROLE_KEY` es exclusiva del servidor. Revisar los Redirect URLs de Supabase Auth para el dominio de la instalación y las rutas `/auth/callback?flow=oauth` y `/auth/callback?flow=confirm`.
4. Para pagos, configurar `APP_URL` como origen público HTTPS, token de Mercado Pago, firma secreta del webhook e ID de vendedor de la misma aplicación y entorno. Registrar el webhook `/api/v1/payments/webhook` para el evento de pagos.
5. Configurar Turnstile con el dominio usado y su Site Key. Las claves privadas y tokens nunca llevan el prefijo `NEXT_PUBLIC_`.
6. Ejecutar lint, build y pruebas antes de publicar. Las variables de Vercel se aplican a nuevos despliegues.

El código falla de forma cerrada si faltan las variables de confirmación segura de pagos. Una preferencia de Mercado Pago se guarda por pedido; un estado de creación incierto requiere revisión manual y no se reintenta automáticamente. Un enlace vencido o rechazado por el proveedor tampoco se sustituye automáticamente por otra preferencia para el mismo pedido. En ese caso se debe revisar el pedido y el pago en Mercado Pago antes de intervenir. Los pedidos `rejected`, `cancelled`, `approved` o con precios históricos `legacy_ars` no se pueden volver a pagar.

Para detalle del esquema y decisiones históricas, consultar los comentarios de las migraciones y [notas históricas](historico/README_ANTERIOR.md). No pegar secretos en incidencias, capturas ni chats.
