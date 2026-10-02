# Elite Club

Marketplace académico con React y Next.js App Router. Catálogo de 74 registros del inventario provisto, sin ejecutar macros. Solo se importan nombre, talle, marca, foto y tipo de ropa, más un identificador técnico. No se importan precios, costos, clientes ni ventas.

## Ejecutar

`npm install` y `npm run dev`. Abrir http://localhost:3000.
Producción: `npm run build` y `npm start`.

## Funciones

- Búsqueda, filtros por categoría, marca y talle, orden por nombre y favoritos.
- Carrito CRUD: agregar, mostrar, actualizar cantidades (1–99), eliminar y vaciar con confirmación.
- Pedido simulado que limpia el carrito, sin pagos ni precios ficticios.
- Catálogo de solo lectura: los visitantes no pueden crear, editar ni eliminar productos.
- Persistencia local, diseño adaptable y diálogos nativos accesibles.

El catálogo siempre se carga desde src/data/products.json. Solo el carrito y los favoritos se guardan en localStorage; las antiguas modificaciones locales del catálogo se ignoran. La compra es una demostración sin autenticación ni base de datos compartida. Para reiniciar carrito y favoritos, eliminar la clave elite-club-v1 de localStorage.

## Arquitectura

- app/layout.jsx: layout y metadatos de Next.js.
- app/page.jsx: Server Component que carga los datos iniciales.
- src/components/Store.jsx: componentes React, props, estados, efectos y controles de búsqueda y selección.
- src/lib/cart.js: operaciones inmutables con find, map y filter.
- app/globals.css: variables CSS, Grid, Flexbox y diseño adaptable.
- src/data/products.json: campos seleccionados del Excel.
- public/products: fotos reales extraídas del Excel; algunas filas comparten foto.
- scripts/import-inventory.ps1: importación reproducible de los campos autorizados.

La clase 05 aporta catálogo, carrito persistente y checkout simulado; la 06, React; la 07, Next.js y App Router. Las actividades de ejemplo ajenas al marketplace no son requisitos de esta aplicación. No se recibió una consigna independiente del TP entre los cuatro archivos indicados.

## Verificación

`npm run lint`, `npm run build` y `npm test`.
Las pruebas usan Microsoft Edge instalado y validan CRUD, recarga, favoritos, compra simulada y vista móvil. Las tipografías usan Google Fonts con respaldo local.
Referencia: https://nextjs.org/docs/app/getting-started/installation

Para regenerar imágenes WebP luego de importar: node scripts/optimize-images.mjs.

## Modelos, colores y talles

El catálogo agrupa los 74 registros originales en 43 modelos. src/lib/catalog.js interpreta los colores escritos en los nombres (sin confundir la marca Off White con el color blanco), agrupa modelos y unifica las combinaciones repetidas de color y talle. Se utiliza siempre el inventario del proyecto, sin admitir cambios del catálogo desde el navegador.

Cada tarjeta tiene un botón + junto al corazón y muestras de color, divididas en dos cuando la variante es bicolor. Al elegir un color se despliegan los talles; al seleccionar uno se pliegan para ahorrar espacio. Se muestran XXS a XXL para prendas y los talles numéricos presentes en el catálogo para modelos numéricos; el talle único se selecciona automáticamente y no se muestra. Las opciones que no figuran para el color elegido aparecen tachadas y deshabilitadas. La disponibilidad representa combinaciones existentes en la planilla, no un stock sincronizado ni una cantidad inferida de las filas duplicadas.

El carrito identifica cada variante por su registro canónico y mantiene separados los colores y talles. Los carritos anteriores se resuelven a esas variantes, sumando los duplicados equivalentes. Quitar un artículo del carrito no modifica el catálogo. Las fotografías compartidas de varios colores se conservan tal como aparecen en el inventario. El zoom de las fotos sigue el cursor tanto en las tarjetas como en el detalle del producto.
