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
- Cinta "100% originales" del navbar: aparece ~6s y se auto-oculta (estado
  `cintaVisible`). Catálogo móvil: 2 por fila. Marquee de marcas: tipográfico
  (marcas-marquee.tsx), sin logos PNG a propósito.

## Comandos
- Typecheck/build: `npx tsc --noEmit` · `npm run build`

## Git
Pushear a `main` solo cuando el usuario lo pida (Vercel deploya de main).
