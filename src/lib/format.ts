import { Perfume, CartItem, Cupon, CuponResult } from "@/types/database";

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
 * Concentración (EDP / EDT / Parfum / Elixir / Cologne) derivada del nombre o la
 * categoría del perfume. Devuelve null si no se puede inferir (no muestra badge).
 * No requiere columna nueva: la mayoría de los nombres ya la incluyen ("… EDP").
 */
export function concentracionDe(
  p: Pick<Perfume, "nombre"> & { categoria?: string[] }
): string | null {
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
  items: CartItem[],
  numero: string,
  extras?: { nombre?: string; ciudad?: string; direccion?: string; whatsapp?: string }
): string {
  const total = subtotalCarrito(items);

  const bloques: string[] = [
    "👑 *MAJALIS — NUEVO PEDIDO* 👑",
    "---",
    "📦 *DETALLE DEL PEDIDO:*",
  ];
  items.forEach((it) => {
    bloques.push(
      `• ${it.cantidad}x ${it.perfume.nombre} (${it.perfume.volumen_ml}ml) — Marca: ${it.perfume.marca}`
    );
    if (it.perfume.sku) bloques.push(`  Código: \`${it.perfume.sku}\``);
  });

  bloques.push("", "💰 *RESUMEN:*", `• Total: ${formatGs(total)}`);

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
export function totalCarrito(items: CartItem[], cupon: Cupon | null): number {
  const subtotal = subtotalCarrito(items);
  if (!cupon) return subtotal;
  const descuento = Math.round((subtotal * cupon.porcentaje_descuento) / 100);
  return Math.max(0, subtotal - descuento);
}

/** Descuento absoluto en Gs. por aplicar un cupón. */
export function descuentoCarrito(items: CartItem[], cupon: Cupon | null): number {
  if (!cupon) return 0;
  return Math.round((subtotalCarrito(items) * cupon.porcentaje_descuento) / 100);
}

/**
 * Valida un cupón contra una lista local de cupones válidos.
 * (El schema los define en Supabase; aquí se valida client-side con
 *  la lista que el Server Component pasa al cliente.)
 */
export function validarCupon(
  codigoIngresado: string,
  cupones: Cupon[]
): CuponResult {
  const limpio = codigoIngresado.trim().toUpperCase();
  if (!limpio) {
    return { valido: false, cupon: null, mensaje: "Ingresa un código." };
  }

  const encontrado = cupones.find((c) => c.codigo.toUpperCase() === limpio);

  if (!encontrado) {
    return { valido: false, cupon: null, mensaje: "Este código no existe." };
  }
  if (!encontrado.activo) {
    return { valido: false, cupon: null, mensaje: "Este código está inactivo." };
  }
  if (encontrado.fecha_expiracion && new Date(encontrado.fecha_expiracion) < new Date()) {
    return { valido: false, cupon: null, mensaje: "Este código ha expirado." };
  }
  if (encontrado.usos_actuales >= encontrado.limite_usos) {
    return { valido: false, cupon: null, mensaje: "Este código agotó sus usos." };
  }

  return {
    valido: true,
    cupon: encontrado,
    mensaje: `Código aplicado: ${encontrado.porcentaje_descuento}% de descuento.`,
  };
}
