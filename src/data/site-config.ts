/**
 * Configuración central del sitio Majalis.
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
  tipo: "instagram" | "facebook" | "tiktok";
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
    tipo: "tiktok",
    url: "https://tiktok.com/@sultan.oud.elixir", // 👈 TU TIKTOK
    label: "TikTok",
  },
];

/**
 * Promo de envío que se muestra en el checkout, justo arriba del botón de
 * WhatsApp (sello animado con camioncito).
 * 👉 Cambiá `detalle` cuando venza la fecha, o poné `activo: false` para
 *    ocultarlo del checkout sin tocar nada más.
 */
export const PROMO_ENVIO = {
  activo: true,
  titulo: "Envío incluido",
  detalle: "Gratis en todos los pedidos hasta el 01/08",
};

/**
 * Contraseña del panel de administración (/admin).
 * SOLO se lee de la variable de entorno ADMIN_PASSWORD (.env.local en local,
 * Environment Variables en Vercel). SIN DEFAULT a propósito: antes había una
 * contraseña por defecto hardcodeada acá — cualquiera que viera el repo podía
 * entrar al panel. Si la variable no está configurada, el login SIEMPRE falla
 * (mejor un panel cerrado que uno con contraseña pública).
 */
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Secreto para firmar la cookie de sesión del panel /admin (HMAC).
 * En producción, definí ADMIN_SESSION_SECRET en Vercel con una cadena larga
 * y aleatoria. Si no está definida, deriva de ADMIN_PASSWORD (sin literal
 * adivinable). Sin contraseña configurada, no hay sesiones válidas.
 */
export const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ??
  (ADMIN_PASSWORD ? `majalis-sesion-${ADMIN_PASSWORD}` : "");
