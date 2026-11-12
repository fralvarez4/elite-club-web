# Elite Club

Tienda web académica de indumentaria. Permite explorar 74 variantes de productos, guardar favoritos, armar un carrito, registrarse, consultar pedidos y pagar mediante Mercado Pago Checkout Pro. La administración de productos está reservada al rol administrador.

**Web publicada:** [eliteclubstore.vercel.app](https://eliteclubstore.vercel.app/)

## Funcionalidades

- Catálogo responsive con búsqueda, filtros, variantes y orden por nombre o precio.
- Carrito separado por sesión invitada o cuenta, perfiles y autenticación con Supabase.
- Pedidos con historial, detalle junto a cada pedido y continuación segura de pagos pendientes.
- Precios base USD; cotización MEP verificada y total ARS fijado al crear el pedido.
- Panel de administración con CRUD de productos; confirmación de pagos por webhook verificado.

## Tecnologías y arquitectura

Next.js App Router, React, Supabase (Auth, PostgreSQL y RLS), Mercado Pago Checkout Pro, Vercel y Playwright. Las páginas de `app/` cargan datos y exponen rutas HTTP; `src/components/` implementa la interfaz; `src/lib/` contiene lógica y validaciones; `supabase/migrations/` versiona el esquema y sus controles de acceso. Los importes finales se calculan en la base, y el webhook confirma pagos tras consultar al proveedor.

## Ejecutar localmente

Requiere Node.js y npm. Copiar `.env.example` a `.env.local` y completar las variables del entorno propio según [configuración](docs/CONFIGURACION.md). Nunca publicar `.env.local` ni usar credenciales de Production para pruebas locales.

```bash
npm ci
npm run dev
```

Abrir `http://localhost:3000`. Para verificar: `npm run lint`, `npm run build`, `npm test`, `npm run test:rate-limit` y `npx playwright test --config playwright.admin.config.js`. Las pruebas HTTP usan servicios simulados; no realizan cobros.

## Entrega y documentación

El [estado de entrega](docs/ENTREGA_FINAL.md) indica qué versión está publicada. La [guía de demo y rúbrica](docs/DEMO_Y_RUBRICA.md) mapea E1–E6 y los criterios transversales a rutas, pruebas y evidencia. La [arquitectura](docs/ARQUITECTURA.md) explica permisos, pagos y límites. El [registro de evidencia](docs/EVIDENCIA.md) distingue comprobaciones locales de las realizadas en Production. Las [notas históricas](docs/historico/README_ANTERIOR.md) y la [entrega anterior](docs/historico/ENTREGA_ANTERIOR.md) se conservan como contexto; pueden contener instrucciones que ya no reflejan el código actual.
