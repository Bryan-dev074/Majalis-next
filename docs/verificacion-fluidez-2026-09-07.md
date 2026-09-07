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

`npm test` ejecuta pruebas sobre el código real transpileado: búsquedas, indicaciones de entrega, historial anidado, cambio ficha→carrito, montaje doble, cursor y frescura de stock. `npm run verify` ejecuta pruebas, TypeScript y build; el workflow existente de GitHub ya lo exige en pushes y PRs.

Antes de cambiar animaciones, contextos o checkout, repetir además el recorrido de navegador anterior. No añadir demoras de entrada a botones de compra ni quitar la validación server-side de precio/stock.

## Hallazgo final: disponibilidad antigua por caché

La comprobación de producción encontró que `/api/catalogo/3a274f66-e90d-4f0c-8da0-9e0eb249def3` todavía devolvía Kaaf base con stock 2, aunque Supabase lo había ocultado y puesto en stock 0 a las 16:14 UTC. No había reaparecido en la base: el primer visitante podía recibir la entrada antigua de la caché de datos de Next mientras se regeneraba.

Se eliminó la doble caché SWR para inventario:

- El listado conserva una sola caché CDN de 60 segundos, con revalidación obligatoria al vencer; consulta la base sin otra caché interna.
- Cada apertura de ficha lee precio/stock de la base sin caché CDN ni de datos. La ficha se dibuja inmediatamente con la información visual disponible y muestra `Verificando precio y stock…`; sólo habilita compra después de la respuesta válida.
- La ficha fresca prevalece sobre precios del listado anterior. Un 404 la muestra agotada y la retira del listado y del carrito; una respuesta fallida deja las acciones pendientes de verificación, sin afirmar disponibilidad.
- Las correcciones se conservan localmente durante diez minutos para que una respuesta anterior del listado no deshaga una baja recién comprobada. Una nueva apertura vuelve a verificar.
- Las fotos mantienen su caché: esta corrección no fuerza a descargar de nuevo las imágenes del catálogo.

La guía de caché de Vercel se utilizó para separar caché CDN y caché de datos y evitar servir inventario obsoleto durante una revalidación en segundo plano. Las pruebas reproducen respuestas sucesivas disponible→oculto, headers de ambas rutas, precio fresco, baja 404 y protección contra un listado anterior.

Verificación adicional en navegador con el build final: introduciendo 500 ms de demora de red, la ficha quedó visible a los 22 ms con verificación pendiente, sin afirmar disponibilidad. Un 200 habilitó la compra; un 404 simulado la dejó agotada, retiró la tarjeta y vació el item persistido del carrito; un 503 mantuvo las acciones deshabilitadas con opción de reintentar. Estas respuestas simuladas no modificaron la base de datos.
