/**
 * Configuración central del sitio Sultan Oud Elixir.
 * ────────────────────────────────────────────────────────────────────────────
 *  👉 ESTE es el único archivo que tenés que tocar para cambiar:
 *       · Tu número de WhatsApp
 *       · Los links de tus redes sociales
 *       · La contraseña del panel /admin
 *  Está documentado en `explicacion.md`.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Número de WhatsApp en formato internacional, sin "+", sin espacios. */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "595982064334";

/** Mensaje del botón flotante de WhatsApp (asistencia). */
export const WHATSAPP_MENSAJE_FLOTANTE =
  "Hola, busco asistencia personalizada";

/** Construye el link de WhatsApp para un mensaje dado. */
export function buildWaLink(mensaje: string, numero: string = WHATSAPP_NUMBER): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export interface RedSocial {
  /** Tipo para el estilo del ícono (clase social-luxe). */
  tipo: "instagram" | "facebook" | "whatsapp";
  /** URL completa de tu perfil/número. */
  url: string;
  /** Etiqueta accesible. */
  label: string;
}

/**
 * Redes sociales del footer.
 * 👉 Reemplazá los `url` por los de tus cuentas reales.
 */
export const REDES_SOCIALES: RedSocial[] = [
  {
    tipo: "instagram",
    url: "https://instagram.com/sultan.oud.elixir", // 👈 TU INSTAGRAM
    label: "Instagram",
  },
  {
    tipo: "facebook",
    url: "https://facebook.com/sultan.oud.elixir", // 👈 TU FACEBOOK
    label: "Facebook",
  },
  {
    tipo: "whatsapp",
    url: buildWaLink(WHATSAPP_MENSAJE_FLOTANTE),
    label: "WhatsApp",
  },
];

/**
 * Contraseña del panel de administración (/admin).
 * Se lee de la variable de entorno ADMIN_PASSWORD si existe;
 * si no, usa este valor por defecto. Para cambiarla, editá aquí
 * o mejor: agregá ADMIN_PASSWORD en .env.local y en Vercel.
 */
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "sultan-admin-2026";

/**
 * Secreto para firmar la cookie de sesión del panel /admin (HMAC).
 * En producción, definí ADMIN_SESSION_SECRET en Vercel con una cadena larga
 * y aleatoria. Si no está definida, deriva de ADMIN_PASSWORD para que
 * igualmente funcione (menos seguro, solo para desarrollo).
 */
export const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ??
  `sultan-session-${ADMIN_PASSWORD}-change-me`;
