# Evidencia y límites de comprobación

## Confirmado en esta etapa

- La web pública y `/pedidos` respondieron HTTP 200 antes de esta etapa; el usuario confirmó manualmente el recorrido de cliente y administrador de la versión anterior.
- [GitHub Actions en `main` pasó](https://github.com/fralvarez4/elite-club-web/actions/runs/43233193452) para el commit `3c82507` de la etapa anterior. Las mejoras de este documento requieren una nueva ejecución después de publicarse.
- La lógica de seguridad de pedidos, preferencia única, pago y webhook dispone de pruebas automatizadas locales; ver comandos del README.
- El usuario confirmó antes un pago con comprador de prueba, simulación oficial del webhook con respuesta 200, pedido aprobado y CRUD de producto temporal en Production. Se registró en [entrega histórica](historico/ENTREGA_ANTERIOR.md).

## Límites

- Las dos mejoras de esta etapa se comprueban localmente y deben verificarse en Production después de un despliegue autorizado.
- El preview anterior no tenía la configuración externa para probar Auth y pagos de extremo a extremo.
- No se comprobó cobro real ni recepción automática de webhook para una transacción productiva.
- Una preferencia guardada que Mercado Pago ya no acepte requiere revisión manual; no se crea otra automáticamente para el mismo pedido.
