# Fluidez de Majalis — 7 septiembre 2026

## Causas corregidas

- El detalle de producto escalonaba su contenido mediante una secuencia GSAP: la acción de compra seguía invisible mientras se animaban otras partes. Ahora hay una sola entrada de 180 ms y los controles están presentes desde el primer render; descargar las notas no reinicia la animación.
- Detalle, catálogo y acciones del carrito compartían notificaciones de contexto. Se separaron para no actualizar todas las tarjetas al abrir una ficha o cambiar cantidades.
- El fondo WebGL seguía trabajando detrás de overlays y se aplicaban filtros de desenfoque a pantalla completa y tarjetas. Se pausa el fondo mientras hay overlays/pestaña oculta y se redujo ese trabajo de composición sin cambiar la estructura visual.
- El cursor tenía interpolación de seguimiento. Ahora núcleo y aro reciben las coordenadas del mismo evento de puntero, sin transición de posición. Touch y movimiento reducido lo ocultan.
- Checkout y formulario tenían instancias independientes del perfil de entrega. Ahora usan un único estado, incluidas las indicaciones en el mensaje confirmado por el servidor.
- El cierre asíncrono del historial podía consumir la entrada del siguiente overlay. Una pila comparte el bloqueo de scroll y conserva el estado del router.

## Verificación

Build de producción local (`npm run build`, `next start --port 3107`) comparado con producción anterior, en el mismo navegador automatizado:

| Observación puntual | Antes | Después |
| --- | --- | --- |
| Opacidad local del contenedor CTA tras abrir | 0 a los 32, 132, 337 y 737 ms; todavía parcial a los 1539 ms | 1 desde la primera muestra a los 17 ms |
| Abrir checkout desde el carrito | No se midió | Dialog renderizado a los 14 ms (doble requestAnimationFrame) |
| Cursor en coordenadas 900,510 | Seguimiento interpolado en código | Centro y aro coinciden en el mismo evento; transición CSS 0 s |

Son muestras de laboratorio, no un percentil INP ni una garantía para todos los dispositivos/conexiones. La solicitud de stock/precio sigue dependiendo del servidor; no se eliminó la validación para ganar velocidad.

Pruebas manuales automatizadas en navegador:

- Abrir perfume, añadir al carrito y finalizar pedido.
- Editar nombre, dirección e indicaciones; confirmar que el POST y la URL preparada por `/api/checkout` incluyen exactamente los valores actuales. La navegación a WhatsApp fue interceptada: no se envió ningún pedido.
- Atrás cierra checkout y conserva carrito; Escape cierra carrito y restaura scroll.
- Viewport 393×852: producto/carrito/checkout sin desbordamiento horizontal; dos retrocesos restauran la página.
- Eventos de ratón actualizan posición inmediatamente y un evento touch oculta el cursor.
- TypeScript y build aprobados. Sin errores de runtime Vercel en las 24 horas consultadas antes de publicar.

## Protección ante regresiones

`npm test` ejecuta seis pruebas sobre el código real transpileado: búsquedas, indicaciones de entrega, historial anidado, cambio ficha→carrito, montaje doble y cursor. `npm run verify` ejecuta pruebas, TypeScript y build; el workflow existente de GitHub ya lo exige en pushes y PRs.

Antes de cambiar animaciones, contextos o checkout, repetir además el recorrido de navegador anterior. No añadir demoras de entrada a botones de compra ni quitar la validación server-side de precio/stock.
