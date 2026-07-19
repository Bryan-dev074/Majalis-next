import { FragranceNotes, Perfume } from "@/types/database";
import { FALLBACK_PERFUMES } from "@/data/fallback-perfumes";

/**
 * Repositorio de catálogo.
 *
 * Estrategia:
 *  - En el servidor intenta Supabase.
 *  - En producción falla de forma cerrada si falta configuración o red: nunca
 *    convierte los perfumes demo en un catálogo que acepte pedidos.
 *  - El seed local solo se habilita en desarrollo con una variable explícita.
 *
 * El cliente nunca llama aquí directamente; los datos le llegan ya
 * serializados desde un Server Component.
 */

const CAMPOS_RESUMEN = [
  "id",
  "nombre",
  "marca",
  "precio_regular",
  "precio_descuento",
  "en_oferta",
  "porcentaje_descuento",
  "stock_disponible",
  "volumen_ml",
  "concentracion",
  "url_imagen",
  "categoria",
  "destacado",
  "tipo_producto",
  "es_nicho",
].join(",");

// Las notas y el SKU representan una parte importante del JSON cuando hay
// miles de productos. Solo se consultan para la ficha que el cliente abre.
const CAMPOS_DETALLE = `${CAMPOS_RESUMEN},descripcion,notas_olfativas,sku`;

/**
 * Formato de transporte del listado. Las claves cortas evitan repetir cientos
 * de miles de bytes de nombres de propiedades en un catálogo de 4.000+ filas.
 * La ficha que usa la UI se reconstruye y valida en CatalogProvider.
 */
export interface ResumenCatalogoCompacto {
  i: string; // id
  n: string; // nombre
  m: string; // marca
  r: number; // precio regular
  d?: number; // precio descuento
  o?: 1; // en oferta
  x?: number; // porcentaje descuento
  s: number; // stock
  v: number; // volumen ml
  c?: string; // concentración
  u: string; // URL o nombre compacto de imagen
  g: string[]; // categorías/familias necesarias para filtros
  f?: 1; // destacado
  t?: string; // tipo distinto de perfume
  h?: 1; // nicho
}

export interface CatalogoCompactoPayload {
  version: 2;
  productos: ResumenCatalogoCompacto[];
}

function listaStrings(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizarNotas(valor: unknown): FragranceNotes {
  const notas =
    typeof valor === "object" && valor !== null
      ? (valor as Record<string, unknown>)
      : {};
  return {
    salida: listaStrings(notas.salida),
    corazon: listaStrings(notas.corazon),
    fondo: listaStrings(notas.fondo),
  };
}

/** Fila compacta para tarjetas, búsqueda, favoritos, precio y stock. */
function normalizarResumen(row: Record<string, unknown>): Perfume {
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
    // La consulta ya filtra activo=true. Se mantiene en el objeto porque la UI
    // y el carrito lo usan como guardia antes de agregar.
    activo: true,
    url_imagen: String(row.url_imagen ?? ""),
    descripcion: String(row.descripcion ?? ""),
    categoria: listaStrings(row.categoria),
    destacado: Boolean(row.destacado),
    // No se muestra en la tienda pública; el contador real solo lo necesita el
    // panel administrativo, que usa su propia consulta autenticada.
    clicks_mensuales: 0,
    // Categoría (perfume | mini | deo | kit) + vitrina nicho (jul-2026)
    tipo_producto: String(row.tipo_producto ?? "perfume"),
    es_nicho: row.es_nicho === true,
  };
}

/** Ficha pública bajo demanda. No expone tiendas/origen ni timestamps internos. */
function normalizarDetalle(row: Record<string, unknown>): Perfume {
  return {
    ...normalizarResumen(row),
    notas_olfativas: normalizarNotas(row.notas_olfativas),
    sku: row.sku == null ? null : String(row.sku),
  };
}

function compactarImagen(urlImagen: string, supabaseUrl?: string): string {
  if (!urlImagen || !supabaseUrl) return urlImagen;
  const prefijo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/productos/catalogo/`;
  return urlImagen.startsWith(prefijo)
    ? `@${urlImagen.slice(prefijo.length)}`
    : urlImagen;
}

function compactarResumen(
  perfume: Perfume,
  supabaseUrl?: string
): ResumenCatalogoCompacto {
  const resumen: ResumenCatalogoCompacto = {
    i: perfume.id,
    n: perfume.nombre,
    m: perfume.marca,
    r: perfume.precio_regular,
    s: perfume.stock_disponible,
    v: perfume.volumen_ml,
    u: compactarImagen(perfume.url_imagen, supabaseUrl),
    g: perfume.categoria,
  };
  if (perfume.precio_descuento != null) resumen.d = perfume.precio_descuento;
  if (perfume.en_oferta) resumen.o = 1;
  if (perfume.porcentaje_descuento > 0) resumen.x = perfume.porcentaje_descuento;
  if (perfume.concentracion) resumen.c = perfume.concentracion;
  if (perfume.destacado) resumen.f = 1;
  if (perfume.tipo_producto && perfume.tipo_producto !== "perfume") {
    resumen.t = perfume.tipo_producto;
  }
  if (perfume.es_nicho) resumen.h = 1;
  return resumen;
}

function construirPayload(
  perfumes: Perfume[],
  supabaseUrl?: string
): CatalogoCompactoPayload {
  return {
    version: 2,
    productos: perfumes.map((perfume) => compactarResumen(perfume, supabaseUrl)),
  };
}

function fallbackDevHabilitado(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.MAJALIS_DEV_FALLBACK_CATALOG === "true"
  );
}

function configuracionSupabase(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
}

/**
 * Obtiene el resumen compacto del catálogo desde Supabase. El seed local solo
 * existe como opt-in explícito durante desarrollo.
 */
export async function fetchCatalogo(): Promise<CatalogoCompactoPayload> {
  const configuracion = configuracionSupabase();

  // Una configuración rota en producción no puede parecer una tienda válida:
  // responderemos 503 y la UI ofrecerá reintentar. Los demos son opt-in y solo
  // sirven para desarrollo local deliberado.
  if (!configuracion) {
    if (fallbackDevHabilitado()) {
      return construirPayload(
        FALLBACK_PERFUMES.map((perfume) =>
          normalizarResumen(perfume as unknown as Record<string, unknown>)
        )
      );
    }
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const { url, anon } = configuracion;

  try {
    // PostgREST corta en 1.000 filas. Primero obtenemos el total y luego traemos
    // las páginas EN PARALELO: con más de 4.000 productos, hacerlo secuencial
    // agregaba varios segundos antes de mostrar el catálogo.
    const PAGE = 1000;
    const headers = {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Accept: "application/json",
    };

    async function contarActivos(): Promise<number | null> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `${url}/rest/v1/perfumes?select=id&activo=eq.true`,
          {
            method: "HEAD",
            headers: { ...headers, Prefer: "count=exact" },
            signal: controller.signal,
            next: { revalidate: 60 },
          }
        );
        if (!res.ok) return null;
        const total = Number(res.headers.get("content-range")?.split("/")[1]);
        return Number.isFinite(total) ? total : null;
      } finally {
        clearTimeout(timeout);
      }
    }

    async function descargarPagina(offset: number): Promise<Record<string, unknown>[] | null> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `${url}/rest/v1/perfumes?select=${CAMPOS_RESUMEN}&activo=eq.true&order=destacado.desc,marca.asc,nombre.asc,id.asc&limit=${PAGE}&offset=${offset}`,
          { headers, signal: controller.signal, next: { revalidate: 60 } }
        );
        if (!res.ok) {
          console.error("[fetchCatalogo] Supabase respondió", res.status, "offset", offset);
          return null;
        }
        const rows = (await res.json()) as Record<string, unknown>[];
        return Array.isArray(rows) ? rows : null;
      } finally {
        clearTimeout(timeout);
      }
    }

    const total = await contarActivos();
    if (total != null) {
      if (total === 0) return construirPayload([], url);
      const paginas = await Promise.all(
        Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => descargarPagina(i * PAGE))
      );
      if (paginas.some((p) => p == null)) {
        throw new Error("Supabase no entregó una o más páginas del catálogo");
      }
      return construirPayload(
        paginas.flatMap((rows) => (rows ?? []).map(normalizarResumen)),
        url
      );
    }

    // Fallback compatible si el servidor no entrega Content-Range.
    const todos: Perfume[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const rows = await descargarPagina(offset);
      if (rows == null) throw new Error(`Supabase no entregó la página ${offset / PAGE + 1}`);
      todos.push(...rows.map(normalizarResumen));
      if (rows.length < PAGE) break;
    }
    // Con la base configurada y respondiendo devolvemos lo que haya — incluso
    // vacío. Antes una respuesta vacía caía al seed y resucitaba los 11 demos
    // como "fantasmas" imposibles de ocultar.
    return construirPayload(todos, url);
  } catch (e) {
    // Un fallo transitorio NO debe reemplazar en caché un catálogo válido por
    // una lista vacía. El endpoint devolverá 503 y el navegador conservará la
    // última versión que ya tenía cargada.
    console.error("[fetchCatalogo] Error consultando Supabase:", e);
    throw e;
  }
}

/**
 * Obtiene la ficha pública completa de un único producto activo.
 *
 * Precio y stock también vienen en esta respuesta para que la ficha sea
 * autónoma, aunque el cliente da prioridad al resumen global más reciente al
 * fusionar ambas versiones.
 */
export async function fetchDetalleCatalogo(id: string): Promise<Perfume | null> {
  const limpio = id.trim();
  const esUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      limpio
    );
  const esFallback = /^fb-\d+$/.test(limpio);
  // `perfumes.id` es UUID. Rechazar antes de llegar a PostgREST evita que un
  // deep-link malformado se convierta en 400/503 en vez de un 404 limpio.
  if (!esUuid && !esFallback) return null;

  const configuracion = configuracionSupabase();
  if (!configuracion) {
    if (fallbackDevHabilitado()) {
      const perfume = FALLBACK_PERFUMES.find(
        (item) => item.id === limpio && item.activo !== false
      );
      return perfume ? normalizarDetalle(perfume as unknown as Record<string, unknown>) : null;
    }
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (esFallback) return null;

  const { url, anon } = configuracion;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const query = new URLSearchParams({
    select: CAMPOS_DETALLE,
    id: `eq.${limpio}`,
    activo: "eq.true",
    limit: "1",
  });

  try {
    const res = await fetch(`${url}/rest/v1/perfumes?${query.toString()}`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`Supabase respondió ${res.status} al consultar detalle`);
    }
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error("Supabase devolvió un detalle con formato inválido");
    }
    const row = rows[0];
    return row && typeof row === "object"
      ? normalizarDetalle(row as Record<string, unknown>)
      : null;
  } catch (error) {
    console.error("[fetchDetalleCatalogo] Error consultando Supabase:", error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
