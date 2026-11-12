# Estado de entrega de Elite Club

La [web pública](https://eliteclubstore.vercel.app/) se despliega desde `main`. La versión final incluye detalle de pedidos en línea, continuación de pagos pendientes y documentación reorganizada. La [ejecución de CI de la rama de entrega](https://github.com/fralvarez4/elite-club-web/actions/runs/43236767090) pasó antes de integrar el cambio; el estado del despliegue y del CI de `main` puede consultarse en [Actions](https://github.com/fralvarez4/elite-club-web/actions) y Vercel.

Tras detectar que un pago de prueba podía repetirse si no llegaba el webhook, se añadió una comprobación directa contra los pagos del vendedor en Mercado Pago antes de reabrir una preferencia. El pago aprobado se registra con la RPC protegida existente; ante estados o respuestas inciertas se bloquea el reintento. La comprobación manual de esta revisión en Production sigue siendo necesaria.

Para el profesor: comenzar por el [README](../README.md), seguir la [guía de demo y rúbrica](DEMO_Y_RUBRICA.md) y consultar [evidencia](EVIDENCIA.md) y [arquitectura](ARQUITECTURA.md) para preguntas técnicas.

Antes de presentar: recorrer manualmente en Production el detalle de un pedido y «Continuar pago» con un pedido de prueba pendiente. No reutilizar un pago ya aprobado ni cambiar datos reales de la tienda durante esta comprobación.
