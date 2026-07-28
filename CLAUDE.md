# Tienda — Sultan Oud Elixir

E-commerce de perfumes (Next.js 14 + Supabase + Tailwind). Panel admin en `/admin`.
Comparte el Supabase con el HUB `../Scraping` (dashboard + scraper). Contexto completo
del sistema entero: `../Scraping/CONTEXTO-CONTINUAR.txt` (documentación viva — si
cambiás algo relevante acá, actualizala también).

## Estructura
- `src/app/(tienda)/` — catálogo público · `src/app/(admin)/admin/` — panel del dueño.
- Tabla Supabase: `perfumes` (código = columna `sku`). El HUB escribe acá vía
  "Agregar a mi tienda" y el scraper ACTUALIZA `precio_regular` tras cada corrida.
- `src/lib/catalog.ts` — fetch del catálogo (`/api/catalogo`, force-dynamic, select=*).
- `src/lib/format.ts` — precios, WhatsApp, `concentracionDe` (badge EDP/EDT).

## Reglas / gotchas (NO re-descubrir esto)
- MENSAJE DE MARCA (jul-2026): se ELIMINÓ "pago al recibir" de TODO el sitio. La promesa
  es "Perfumes 100% originales · Envío a todo el país" (cinta dorada en el navbar,
  siempre visible) + "Despacho exclusivo... rastreo directo hasta tu puerta"
  (importación) + "Total del pedido" en el checkout. NO reintroducir "pago al recibir".
- PRECIOS: siempre múltiplo de 500 Gs (los calcula/redondea el HUB — `redondearPrecio`
  en Scraping/src/lib/calc.ts y scraper/lib-precio.mjs). No setear precios "sueltos".
- `perfumes.activo` puede ponerse en false AUTOMÁTICAMENTE: el botón "Actualizar mi
  tienda" del HUB oculta los productos que quedaron SIN STOCK en todas las tiendas
  de CDE. Nunca se reactivan solos (eso lo decide el dueño desde /admin).
- `perfumes.porcentaje_descuento` es columna GENERADA: no incluirla en inserts.
- CATEGORÍAS (jul-2026): `perfumes.tipo_producto` ∈ perfume|mini|deo|kit y
  `perfumes.es_nicho` (bool). La vitrina (`src/lib/categorias.ts` + catalogo.tsx)
  muestra pestañas Todos/Perfumes/Nicho/Miniaturas/Desodorantes/Kits con conteos —
  SOLO las que tienen productos activos. "perfume" excluye nicho (vitrina propia);
  una mini nicho vive en las dos. El Hub manda ambos campos en filaParaTienda;
  filas viejas sin campo = perfume (default). Badge de tipo/nicho en product-card.
- next/image SOLO renderiza imágenes de `*.supabase.co` (+ unsplash/fimgs/notino) —
  por eso el HUB sube las fotos scrapeadas a Storage antes de estirarlas acá.
- ⚠️ FOTOS DE PRODUCTO SIN OPTIMIZADOR DE VERCEL (17-jul): la cuota de Image
  Optimization (5.000 transform/mes en Hobby) se agotaba — cada foto nueva/cambiada
  paga transformaciones. TODA foto de producto va por `<FotoProducto>`
  (`src/components/ui/foto-producto.tsx`): `unoptimized` + variante de tarjeta
  PRE-GENERADA por el pipeline del scraper (480w webp ~20-40KB en Storage,
  `{carpeta}/card/{slug}.webp`). `fotoCard()` en `src/lib/foto.ts` mapea la URL
  (misma convención que `rutaCard()` en scraper/generar-variantes-card.mjs — sync
  manual). El modal usa `variante="original"`; onError cae al original si la
  variante aún no existe. Foto de producto nueva = usar FotoProducto, NUNCA
  `next/image` pelado (volvería a comer cuota).
- Dropi / "Envío Express" YA SE ELIMINÓ (botón, badges, esExterno, split de checkout,
  pestaña Origen Externo, proveedores, sync). `es_dropi`/`tiendas` dormidos. No volver.
- Asistente IA (/admin): solo Gemini (datos) + foto + guardar en `perfumes`.
- La anon key es formato nuevo `sb_publishable_…`; las dos apps usan la misma.
- La pirámide olfativa la llena el HUB (Gemini) y llega por `notas_olfativas`
  {salida,corazon,fondo}; el modal la renderiza tal cual.
- GSAP en product-modal: la timeline va keyeada por `perfume?.id`, NUNCA por el
  objeto — el CatalogProvider regenera identidades al refrescar y con `[perfume]`
  la animación se reiniciaba en loop dejando los `.nota-chip` en opacity 0
  ("la pirámide no aparece"). Ídem para cualquier animación futura con datos del provider.
  Mismo motivo en el BLOQUEO DE SCROLL del modal: depende de `[abierto]` (= `!!perfume`),
  no del objeto — con `[perfume]` soltaba y reponía `body.overflow` en loop.
- ⚠️ NUNCA `scroll-behavior: smooth` en `html` (27-jul). Aplicado global afecta a TODO scroll,
  incluida la restauración de posición: el navegador deja una animación en curso y, si el usuario
  arrastra la barra, al SOLTAR la animación retoma su destino y la página "vuelve sola" abajo
  (reporte del dueño). Las 10 llamadas que quieren scroll suave ya pasan `behavior:"smooth"`
  explícito y no hay ningún `href="#"`, así que la regla global no aportaba nada.
- ⚠️ TURBOPACK ES ESTRICTO CON EL CSS: declaraciones sueltas dentro de un `@media` (fuera de
  todo selector) los navegadores las descartan en silencio, pero el build FALLA con "Unexpected
  end of input" y el deploy no sale. Pasó en `.coleccion` (27-jul): el carrusel de colecciones
  llevaba tiempo sin enganchar en móvil por eso. Si el build se rompe en un `}` que se ve bien,
  buscá declaraciones huérfanas ANTES de esa línea, no la llave.
- Cinta "100% originales" del navbar: aparece ~6s y se auto-oculta (estado
  `cintaVisible`). Catálogo móvil: 2 por fila. Marquee de marcas: tipográfico
  (marcas-marquee.tsx), sin logos PNG a propósito.

## Comandos
- Typecheck/build: `npx tsc --noEmit` · `npm run build`

## Git
Pushear a `main` solo cuando el usuario lo pida (Vercel deploya de main).
