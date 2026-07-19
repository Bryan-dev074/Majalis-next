import { Perfume, CartItem, CuponPublico } from "@/types/database";

/**
 * Formatea un monto en Guaraníes paraguayos (Gs.) sin decimales.
 */
export function formatGs(valor: number): string {
  const entero = Math.round(valor || 0);
  return `Gs. ${new Intl.NumberFormat("es-PY").format(entero)}`;
}

/**
 * Precio efectivo de un perfume (descuento si aplica, si no el regular).
 */
export function precioEfectivo(p: Pick<Perfume, "en_oferta" | "precio_descuento" | "precio_regular">): number {
  if (p.en_oferta && p.precio_descuento != null) {
    return p.precio_descuento;
  }
  return p.precio_regular;
}

/**
 * Normaliza texto para búsqueda: minúsculas, sin acentos, sin puntuación.
 * "Fórmula / EDP" y "formula edp" quedan iguales.
 */
export function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Palabras vacías que NO exigen coincidencia (las tiendas las ponen o sacan
 *  a gusto: "Club de Nuit" vs "Club Nuit"). */
const STOPWORDS_BUSQUEDA = new Set(["de", "del", "la", "le", "el", "los", "las", "y", "the", "of", "and"]);

/**
 * Búsqueda por TOKENS sobre marca + nombre + categoría: cada palabra "real" de
 * la consulta tiene que aparecer en algún lado de la ficha. Así
 * "armaf club de nuit int" encuentra el "Club de Nuit Intense Man" de Armaf
 * aunque ninguna columna sola contenga la frase completa; los acentos y las
 * mayúsculas no importan. Con consulta vacía devuelve true (no filtra).
 */
export function coincideBusqueda(
  p: Pick<Perfume, "nombre" | "marca"> & {
    categoria?: string[];
    volumen_ml?: number;
    tipo_producto?: string;
    es_nicho?: boolean;
    concentracion?: string | null;
  },
  consulta: string
): boolean {
  // "10 ml" → "10ml" (un solo token de volumen)
  const cruda = normalizarBusqueda(consulta).replace(/(\d+)\s+ml\b/g, "$1ml");
  const tokens = cruda.split(" ").filter((t) => t && !STOPWORDS_BUSQUEDA.has(t));
  if (!tokens.length) return true;
  // La ficha buscable incluye TIPO (kit/desodorante/miniatura), nicho,
  // concentración y volumen — "10ml", "kit lattafa" o "nicho oud" funcionan.
  const TIPO_TXT: Record<string, string> = {
    mini: "miniatura mini",
    deo: "desodorante deo",
    kit: "kit set estuche",
    perfume: "perfume",
  };
  const ficha = normalizarBusqueda(
    [
      p.marca,
      p.nombre,
      (p.categoria ?? []).join(" "),
      TIPO_TXT[p.tipo_producto ?? "perfume"] ?? "",
      p.es_nicho ? "nicho" : "",
      p.concentracion ?? "",
      p.volumen_ml ? `${p.volumen_ml}ml` : "",
    ].join(" ")
  );
  return tokens.every((t) => {
    // token de VOLUMEN ("10ml") → coincidencia EXACTA de mililitros
    const ml = t.match(/^(\d{1,3})ml$/);
    if (ml) return Number(p.volumen_ml) === Number(ml[1]);
    return ficha.includes(t);
  });
}

/**
 * Concentración (EDP / EDT / Parfum / Elixir / Cologne) derivada del nombre o la
 * categoría del perfume. Devuelve null si no se puede inferir (no muestra badge).
 * No requiere columna nueva: la mayoría de los nombres ya la incluyen ("… EDP").
 */
export function concentracionDe(
  p: Pick<Perfume, "nombre"> & { categoria?: string[]; concentracion?: string | null }
): string | null {
  // El dato explícito de la ficha manda (columna perfumes.concentracion);
  // el parseo del nombre queda como fallback para fichas sin completar.
  if (p.concentracion) return p.concentracion;
  const texto = `${p.nombre} ${(p.categoria ?? []).join(" ")}`.toLowerCase();
  if (/\beau de parfum\b|\bedp\b/.test(texto)) return "EDP";
  if (/\beau de toilette\b|\bedt\b/.test(texto)) return "EDT";
  if (/\beau de cologne\b|\bedc\b|\bcologne\b/.test(texto)) return "Cologne";
  if (/\belixir\b/.test(texto)) return "Elixir";
  if (/\bparfum\b|\bextrait\b/.test(texto)) return "Parfum";
  return null;
}

/**
 * Construye la URL de WhatsApp hacia el número de Majalis, con el mensaje
 * personalizado exigido por el brief:
 *   "Quiero hacer un pedido del perfume [Nombre del Perfume]"
 * Reemplaza dinámicamente el nombre exacto de la fragancia.
 */
export function buildWhatsAppUrl(nombrePerfume: string, numero: string): string {
  const mensaje = `Quiero hacer un pedido del perfume ${nombrePerfume}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Genera el mensaje de WhatsApp para un carrito completo (checkout).
 * Un solo flujo: stock local de Majalis. Los datos de entrega son
 * opcionales (si el cliente los cargó) y el pago/envío se coordina por WhatsApp.
 */
export function buildWhatsAppCheckoutUrl(
  items: Array<{
    cantidad: number;
    perfume: Pick<
      Perfume,
      "nombre" | "marca" | "volumen_ml" | "sku" | "precio_regular" | "precio_descuento" | "en_oferta"
    >;
  }>,
  numero: string,
  extras?: { nombre?: string; ciudad?: string; direccion?: string; whatsapp?: string },
  resumenConfirmado?: {
    subtotal: number;
    descuento: number;
    total: number;
    codigoCupon?: string | null;
    porcentajeCupon?: number | null;
  }
): string {
  const subtotal = resumenConfirmado?.subtotal ?? items.reduce(
    (acc, it) => acc + precioEfectivo(it.perfume) * it.cantidad,
    0
  );
  const descuento = resumenConfirmado?.descuento ?? 0;
  const total = resumenConfirmado?.total ?? Math.max(0, subtotal - descuento);

  const bloques: string[] = [
    "👑 *MAJALIS — NUEVO PEDIDO* 👑",
    "---",
    "📦 *DETALLE DEL PEDIDO:*",
  ];
  items.forEach((it) => {
    bloques.push(
      `• ${it.cantidad}x ${it.perfume.nombre} (${it.perfume.volumen_ml}ml) — Marca: ${it.perfume.marca} — ${formatGs(precioEfectivo(it.perfume) * it.cantidad)}`
    );
    if (it.perfume.sku) bloques.push(`  Código: \`${it.perfume.sku}\``);
  });

  bloques.push("", "💰 *RESUMEN:*", `• Subtotal: ${formatGs(subtotal)}`);
  if (descuento > 0) {
    const detalleCupon = resumenConfirmado?.codigoCupon
      ? ` (${resumenConfirmado.codigoCupon}${resumenConfirmado.porcentajeCupon ? ` · ${resumenConfirmado.porcentajeCupon}%` : ""})`
      : "";
    bloques.push(`• Descuento${detalleCupon}: -${formatGs(descuento)}`);
  }
  bloques.push(`• *Total: ${formatGs(total)}*`);

  const hayDatos = extras && (extras.nombre || extras.ciudad || extras.direccion || extras.whatsapp);
  if (hayDatos) {
    bloques.push(
      "",
      "📌 *DATOS DE ENTREGA:*",
      `• Nombre: ${extras?.nombre || "—"}`,
      `• Ciudad: ${extras?.ciudad || "—"}`,
      `• Dirección: ${extras?.direccion || "—"}`,
      `• Teléfono: ${extras?.whatsapp || "—"}`
    );
  }

  bloques.push("", "¿Me confirman disponibilidad para coordinar el pago y el envío? 🙏");

  return `https://wa.me/${numero}?text=${encodeURIComponent(bloques.join("\n"))}`;
}

/** Subtotal sin descuento de cupón. */
export function subtotalCarrito(items: CartItem[]): number {
  return items.reduce((acc, it) => acc + precioEfectivo(it.perfume) * it.cantidad, 0);
}

/** Total aplicando cupón (si válido). */
export function totalCarrito(items: CartItem[], cupon: CuponPublico | null): number {
  const subtotal = subtotalCarrito(items);
  if (!cupon) return subtotal;
  const descuento = Math.round((subtotal * cupon.porcentaje_descuento) / 100);
  return Math.max(0, subtotal - descuento);
}

/** Descuento absoluto en Gs. por aplicar un cupón. */
export function descuentoCarrito(items: CartItem[], cupon: CuponPublico | null): number {
  if (!cupon) return 0;
  return Math.round((subtotalCarrito(items) * cupon.porcentaje_descuento) / 100);
}
