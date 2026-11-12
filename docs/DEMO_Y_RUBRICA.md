# Guía breve de demostración y rúbrica

[Rúbrica oficial PW 2026 Q1](https://indexitba.estebanpiazza.com.ar/grilla.html). La nota final corresponde al profesor; esta tabla indica dónde verificar cada criterio de nivel Excelente.

| Criterio | Recorrido o evidencia | Límite |
| --- | --- | --- |
| E1 Repositorio, CI/CD y preview | [Actions de `main`](https://github.com/fralvarez4/elite-club-web/actions), historial de PR y despliegues de Vercel | El preview anterior carecía de variables de Supabase; verificar un preview funcional antes de afirmar cobertura completa. |
| E2 Landing responsive | Inicio, catálogo y navegación a 390 px y escritorio; pruebas `desktop`, `navigation`, `redesign` | Una prueba automatizada no reemplaza auditoría con lector de pantalla. |
| E3 Formularios dinámicos | Registro, perfil y entrega; validación y fetch; pruebas `auth`, `checkout`, `delivery` | Mostrar errores de campos inválidos en la demo. |
| E4 Catálogo y API | Buscar, filtrar, ordenar, elegir variante y consultar `/api/v1/delivery-options` | Checklist histórico en PR; catálogo cargado de Supabase. |
| E5 Supabase y admin | Entrar con rol admin, crear/editar/eliminar producto temporal, observar cambios públicos; pruebas `admin` y RLS | Usar datos temporales, no alterar productos reales durante la defensa. |
| E6 Checkout y webhook | Pedido de prueba con total ARS, Checkout Pro, simulación de webhook con ID real, estado aprobado; pruebas `payment-webhook`, `checkout` | No se comprobó cobro real ni entrega automática de notificaciones productivas. |
| Funcionalidad, código, interfaz, despliegue y documentación | Recorrer catálogo → carrito → pedido → pago; revisar `src/`, `app/`, [web pública](https://eliteclubstore.vercel.app/), este README y [evidencia](EVIDENCIA.md) | La evaluación de calidad y accesibilidad queda a criterio docente. |

## Recorrido sugerido (5 minutos)

1. Abrir la [tienda](https://eliteclubstore.vercel.app/), buscar un producto, filtrar y ordenar por precio. Mostrar carrito en celular.
2. Iniciar sesión con cuenta de prueba. Abrir «Mis pedidos», cambiar de página y desplegar el detalle de un pedido antiguo. En un pedido `pending`, mostrar «Continuar pago»; en uno aprobado, comprobar que no aparece.
3. Mostrar edición de perfil y validación de entrega. En admin, mostrar el panel y un producto temporal; evitar cambios sobre el catálogo de entrega.
4. Mostrar [Actions](https://github.com/fralvarez4/elite-club-web/actions), Vercel y la consulta de un pedido aprobado más su evento de pago, ocultando IDs privados y secretos. Explicar que el webhook fue simulado oficialmente con un pago de prueba.

No compartir contraseñas ni claves con el profesor por medio del repositorio. Preparar cuentas de demostración por separado.
