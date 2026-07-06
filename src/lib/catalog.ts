import { Perfume } from "@/types/database";
import { FALLBACK_PERFUMES } from "@/data/fallback-perfumes";

/**
 * Repositorio de catálogo.
 *
 * Estrategia:
 *  - En el servidor (SSR/Server Components) intenta Supabase.
 *  - Si no hay red, las variables no existen, o la tabla está vacía,
 *    cae al seed local (FALLBACK_PERFUMES) sin romper el render.
 *  - Esto garantiza que el sitio se vea perfecto en cualquier despliegue.
 *
 * El cliente nunca llama aquí directamente; los datos le llegan ya
 * serializados desde un Server Component.
 */

function normalizarPerfume(row: Record<string, unknown>): Perfume {
  const sku = row.sku == null ? null : String(row.sku);
  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    marca: String(row.marca ?? ""),
    precio_regular: Number(row.precio_regular ?? 0),
    precio_descuento:
      row.precio_descuento == null ? null : Number(row.precio_descuento),
    en_oferta: Boolean(row.en_oferta),
    porcentaje_descuento: Number(row.porcentaje_descuento ?? 0),
    stock_disponible: Number(row.stock_disponible ?? 0),
    volumen_ml: Number(row.volumen_ml ?? 100),
    concentracion: row.concentracion ? String(row.concentracion) : null,
    activo: row.activo !== false,
    url_imagen: String(row.url_imagen ?? ""),
    descripcion: String(row.descripcion ?? ""),
    notas_olfativas: (row.notas_olfativas ?? {
      salida: [],
      corazon: [],
      fondo: [],
    }) as Perfume["notas_olfativas"],
    categoria: Array.isArray(row.categoria) ? (row.categoria as string[]) : [],
    tiendas: Array.isArray(row.tiendas)
      ? (row.tiendas as Perfume["tiendas"])
      : [],
    sku,
    destacado: Boolean(row.destacado),
    // Columna explícita o, en su defecto, prefijo del SKU
    es_dropi:
      row.es_dropi === true || (sku != null && sku.startsWith("DROPI-")),
    // Demo: los perfumes de prueba iniciales (seed)
    es_demo: Boolean(row.es_demo),
    // Contador de vistas del detalle (0 por defecto)
    clicks_mensuales: Number(row.clicks_mensuales ?? 0),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Obtiene el catálogo completo desde Supabase o, en su defecto,
 * desde el seed local de respaldo.
 */
export async function fetchCatalogo(): Promise<Perfume[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin base de datos configurada (preview / deploy nuevo sin variables):
  // mostramos el seed de respaldo para que el sitio no se vea vacío.
  if (!url || !anon) {
    return FALLBACK_PERFUMES;
  }

  try {
    // ⚠️ PostgREST corta en 1.000 filas por request (sin error). Con el catálogo
    // ya en ~1.800 perfumes activos, hay que PAGINAR con limit/offset, o la tienda
    // mostraría solo 1.000 (bug real: el dashboard veía 1.839 y la web 1.000).
    const PAGE = 1000;
    const todos: Perfume[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `${url}/rest/v1/perfumes?select=*&activo=eq.true&order=destacado.desc,marca.asc&limit=${PAGE}&offset=${offset}`,
        {
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
            Accept: "application/json",
          },
          signal: controller.signal,
          // En SSR queremos datos frescos del catálogo.
          cache: "no-store",
        }
      );

      clearTimeout(timeout);

      if (!res.ok) {
        // La base respondió con error: NO resucitamos el seed (haría aparecer
        // 11 perfumes "fantasma"). Si ya juntamos páginas previas devolvemos
        // esas; si falló la primera, catálogo vacío.
        console.error("[fetchCatalogo] Supabase respondió", res.status);
        return todos;
      }

      const rows = (await res.json()) as Record<string, unknown>[];
      if (!Array.isArray(rows)) break;
      todos.push(...rows.map(normalizarPerfume));
      // Última página: vino incompleta (menos de PAGE) → terminamos.
      if (rows.length < PAGE) break;
    }

    // Con la base configurada y respondiendo devolvemos lo que haya — incluso
    // vacío. Antes una respuesta vacía caía al seed y resucitaba los 11 demos
    // como "fantasmas" imposibles de ocultar.
    return todos;
  } catch (e) {
    // Error de red, timeout o parse con la base configurada: catálogo vacío,
    // no el seed (misma razón que arriba).
    console.error("[fetchCatalogo] Error consultando Supabase:", e);
    return [];
  }
}

/** Catálogo sincrónico de respaldo (para fines de SEO/preview). */
export function getFallbackCatalogo(): Perfume[] {
  return FALLBACK_PERFUMES;
}
