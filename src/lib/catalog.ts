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
    activo: row.activo !== false,
    url_imagen: String(row.url_imagen ?? ""),
    descripcion: String(row.descripcion ?? ""),
    notas_olfativas: (row.notas_olfativas ?? {
      salida: [],
      corazon: [],
      fondo: [],
    }) as Perfume["notas_olfativas"],
    categoria: Array.isArray(row.categoria) ? (row.categoria as string[]) : [],
    sku,
    destacado: Boolean(row.destacado),
    // Columna explícita o, en su defecto, prefijo del SKU
    es_dropi:
      row.es_dropi === true || (sku != null && sku.startsWith("DROPI-")),
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

  if (!url || !anon) {
    return FALLBACK_PERFUMES;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `${url}/rest/v1/perfumes?select=*&activo=eq.true&order=destacado.desc,marca.asc`,
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
      return FALLBACK_PERFUMES;
    }

    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return FALLBACK_PERFUMES;
    }

    return rows.map(normalizarPerfume);
  } catch {
    // Cualquier error de red, timeout o parse → catálogo local.
    return FALLBACK_PERFUMES;
  }
}

/** Catálogo sincrónico de respaldo (para fines de SEO/preview). */
export function getFallbackCatalogo(): Perfume[] {
  return FALLBACK_PERFUMES;
}
