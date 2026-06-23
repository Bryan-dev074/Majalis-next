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
 * Construye la URL de WhatsApp hacia el número del Sultan, con el mensaje
 * personalizado exigido por el brief:
 *   "Quiero hacer un pedido del perfume [Nombre del Perfume]"
 * Reemplaza dinámicamente el nombre exacto de la fragancia.
 */
export function buildWhatsAppUrl(nombrePerfume: string, numero: string): string {
  const mensaje = `Quiero hacer un pedido del perfume ${nombrePerfume}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Determina si un perfume es de origen externo (contra entrega desde depósito).
 * El cliente NUNCA ve "Dropi": para él solo existen "Envío Inmediato" (local)
 * y "Pago Contra Entrega" (externo).
 */
export function esExterno(p: Pick<Perfume, "es_dropi" | "sku">): boolean {
  return p.es_dropi === true || (p.sku != null && p.sku.startsWith("DROPI-"));
}

/**
 * Genera el mensaje de WhatsApp para un carrito completo (checkout).
 *
 * Dos modalidades según el origen de los productos (marca oculta al cliente):
 *  · LOCAL  (es_dropi = false) → ⚡ ENVÍO INMEDIATO / EXPRESS (pago previo).
 *  · EXTERNO (es_dropi = true) → 🚚 PAGO CONTRA ENTREGA (paga en casa).
 *
 * Si el carrito mezcla ambos, arma un único mensaje con dos bloques.
 * El texto es 100% profesional y nunca revela proveedores externos.
 */
export function buildWhatsAppCheckoutUrl(
  items: CartItem[],
  numero: string,
  extras?: { nombre?: string; ciudad?: string; direccion?: string; whatsapp?: string }
): string {
  const locales = items.filter((it) => !esExterno(it.perfume));
  const externos = items.filter((it) => esExterno(it.perfume));
  const hayLocales = locales.length > 0;
  const hayExternos = externos.length > 0;

  const total = totalCarrito(items, null);

  const bloques: string[] = [
    "👑 *SULTAN OUD ELIXIR — NUEVO PEDIDO* 👑",
    "---",
  ];

  // ───── BLOQUE LOCAL: Envío Inmediato ─────
  if (hayLocales) {
    bloques.push(
      "Olá! Quiero gestionar mi pedido con *⚡ ENVÍO INMEDIATO / EXPRESS*:",
      "",
      "📦 *DETALLE DEL PEDIDO (Express):*"
    );
    locales.forEach((it) => {
      bloques.push(
        `• ${it.cantidad}x ${it.perfume.nombre} (${it.perfume.volumen_ml}ml) — Marca: ${it.perfume.marca}`
      );
      if (it.perfume.sku) bloques.push(`• Código: \`${it.perfume.sku}\``);
    });
    const subtotalLocales = subtotalCarrito(locales);
    bloques.push(
      "",
      "💰 *RESUMEN:*",
      `• Subtotal: ${formatGs(subtotalLocales)}`,
      "• Envío: A coordinar (Despacho rápido desde CDE)",
      `• *TOTAL:* ${formatGs(subtotalLocales)}`,
      "",
      "📌 *REGLA DE ENTREGA EXPRESS:*",
      "_Entiendo que para agilizar el despacho inmediato de mi stock físico local, debo realizar el pago previo vía Transferencia Bancaria o Giro. Por favor, facilítenme los datos de la cuenta para abonar y enviar el comprobante._"
    );
  }

  // ───── BLOQUE EXTERNO: Pago Contra Entrega ─────
  if (hayExternos) {
    if (hayLocales) bloques.push("", "──────────────", "");
    bloques.push(
      "Olá! Quiero gestionar mi pedido con *🚚 PAGO CONTRA ENTREGA (Paga en Casa)*:",
      "",
      "📦 *DETALLE DEL PEDIDO (Contra Entrega):*"
    );
    externos.forEach((it) => {
      bloques.push(
        `• ${it.cantidad}x ${it.perfume.nombre} (${it.perfume.volumen_ml}ml) — Marca: ${it.perfume.marca}`
      );
      if (it.perfume.sku) bloques.push(`• Código: \`${it.perfume.sku}\``);
    });
    const subtotalExternos = subtotalCarrito(externos);
    bloques.push(
      "",
      "💰 *RESUMEN:*",
      `• *TOTAL A PAGAR EN CASA:* ${formatGs(subtotalExternos)}`,
      "",
      "📌 *DATOS DE ENVÍO:*",
      `• Nombre: ${extras?.nombre || "—"}`,
      `• Ciudad: ${extras?.ciudad || "—"}`,
      `• Dirección Exacta: ${extras?.direccion || "—"}`,
      `• Teléfono de contacto: ${extras?.whatsapp || "—"}`,
      "",
      "_Por favor, confirmen mi pedido para preparar el despacho a mi domicilio de forma segura._"
    );
  }

  // Si el carrito es mixto, agregar total consolidado al final
  if (hayLocales && hayExternos) {
    bloques.push("", `💎 *TOTAL GENERAL DEL PEDIDO:* ${formatGs(total)}`);
  }

  const cuerpo = bloques.join("\n");
  return `https://wa.me/${numero}?text=${encodeURIComponent(cuerpo)}`;
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
