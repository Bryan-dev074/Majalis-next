/**
 * fotoCard(url) — URL de la VARIANTE DE TARJETA de una foto de producto.
 *
 * El pipeline del scraper sube cada foto DOS veces a Storage:
 *   catalogo/{slug}.{ext}        → original (≤1500px) — la usa el modal
 *   catalogo/card/{slug}.webp    → 480w webp (~20-40KB) — la usan tarjetas/listas
 *
 * ⚠️ POR QUÉ EXISTE (17-jul): las tarjetas se servían vía el optimizador de imágenes de
 * Vercel y cada foto nueva/cambiada pagaba transformaciones (cuota Hobby: 5.000/mes, se
 * estaba yendo). Con variantes pre-generadas + `unoptimized`, CERO transformaciones.
 * ⚠️ MISMA convención que rutaCard() en scraper/generar-variantes-card.mjs — sync manual.
 */
const MARCA_STORAGE = "/storage/v1/object/public/productos/";

export function fotoCard(url: string): string {
  if (!url) return url;
  const i = url.indexOf(MARCA_STORAGE);
  if (i < 0) return url; // externa (unsplash/etc.) o vacía → tal cual
  const pre = url.slice(0, i + MARCA_STORAGE.length);
  const rel = url.slice(i + MARCA_STORAGE.length).split("?")[0];
  const barra = rel.lastIndexOf("/");
  if (barra < 0 || rel.slice(0, barra).endsWith("/card")) return url; // ya es variante
  const archivo = rel.slice(barra + 1).replace(/\.[a-z0-9]+$/i, "");
  return `${pre}${rel.slice(0, barra)}/card/${archivo}.webp`;
}
