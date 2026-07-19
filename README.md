# Majalis

Tienda online de perfumes para Paraguay: catálogo, búsqueda, ficha de producto,
carrito y cierre de pedido por WhatsApp. Producción: [majalis.com.py](https://www.majalis.com.py/).

## Repositorios y responsabilidades

- **Este repositorio (`Majalis-next`)**: experiencia pública de compra y panel
  administrativo propio de la tienda.
- **[`Dashboard-Comparacde`](https://github.com/Bryan-dev074/Dashboard-Comparacde)**:
  catálogo maestro, comparación de tiendas, scraper, cálculo de costos/precios,
  CRM de clientes y operación programada.
- Ambos usan el mismo proyecto Supabase. El historial canónico de migraciones
  vive en `Dashboard-Comparacde/supabase/migrations`; cualquier copia local en
  este repo existe solo para dejar trazabilidad del cambio que consume Majalis.

## Cómo fluye un precio

1. Los scrapers de `Dashboard-Comparacde/scraper` consultan las tiendas y guardan
   las fuentes válidas en `productos.atributos.precios_tienda`.
2. El cálculo toma el costo real más barato (Gs o USD), IVA de compra si está
   activo y los componentes configurables del negocio.
3. La publicación vinculada por `producto_id` recibe el precio calculado en
   `perfumes.precio_regular`.
4. Majalis lee únicamente las columnas públicas necesarias mediante
   `/api/catalogo`. El listado viaja compacto (tarjetas, filtros, precio y stock);
   descripción, notas y SKU se solicitan solo al abrir `/api/catalogo/[id]`.
   Antes de confirmar un pedido vuelve a validar precio, stock
   y visibilidad para no enviar por WhatsApp datos vencidos. Los cupones también
   se validan y consumen de forma atómica en el servidor; el navegador nunca
   decide por sí solo el descuento final.

La automatización no corre dentro de Vercel: Windows Task Scheduler la ejecuta
en la PC operativa a las 07:30 y 15:00, con revalidaciones y auditoría separadas.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS, GSAP, Three.js y lucide-react
- Supabase/Postgres
- Vercel Analytics y Speed Insights

## Desarrollo

```bash
npm ci
npm run dev
npm run verify
```

`npm run verify` genera los tipos de rutas, ejecuta TypeScript y crea el build de
producción.

## Variables de entorno

Consultar `.env.example` y configurar los valores reales solo en `.env.local` y
Vercel. Como mínimo:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_WHATSAPP_NUMBER
```

`SUPABASE_SERVICE_ROLE_KEY` es exclusivamente de servidor: nunca debe llevar el
prefijo `NEXT_PUBLIC_`, aparecer en logs ni entrar al bundle del navegador.

## Despliegue

Vercel construye este proyecto desde la rama `main`. Antes de publicar, ejecutar
`npm run verify`; los cambios de base deben añadirse primero al historial
canónico del repositorio del dashboard.

[`vercel.json`](vercel.json) ubica las funciones en `gru1` (São Paulo), la misma
región que el Supabase compartido, para reducir la latencia de `/api/catalogo`.
