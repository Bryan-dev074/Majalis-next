import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } from "@/data/site-config";

/**
 * Cliente Supabase con la SERVICE ROLE KEY.
 * SOLO para uso en el servidor (Server Actions / API Routes / Server Components).
 * Nunca se importa en código del cliente (no lleva "use client").
 * La service role saltea el RLS y permite escribir en las tablas.
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ¿Está configurada la service role en este entorno? */
export function adminConfigurado(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Sesión de admin por cookie firmada (HMAC-SHA256).
//  Suficiente para un panel de un solo dueño: la cookie es httpOnly + firmada,
//  así que no se puede falsificar ni leer desde JS del navegador.
// ────────────────────────────────────────────────────────────────────────────

const COOKIE_NAME = "sultan-admin-session";
const DURACION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_FALLOS_LOGIN = 5;
const MAX_IDENTIFICADORES_LOGIN = 2_000;

interface IntentosLogin {
  fallos: number;
  ventanaHasta: number;
  bloqueadoHasta: number;
}

// Defensa local por instancia. En Vercel cada instancia mantiene su propia
// ventana; se combina con comparación de tiempo constante y una demora fija
// para que un ataque de fuerza bruta no sea barato ni revele prefijos.
const intentosLogin = new Map<string, IntentosLogin>();

async function identificadorLogin(): Promise<string> {
  const h = await headers();
  const identificador = (
    h.get("x-forwarded-for")?.split(",", 1)[0].trim() ||
    h.get("x-real-ip")?.trim() ||
    "desconocido"
  );
  return identificador.slice(0, 128);
}

async function secretosIguales(recibido: string, esperado: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(recibido)),
    crypto.subtle.digest("SHA-256", encoder.encode(esperado)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diferencia = 0;
  for (let i = 0; i < aa.length; i += 1) diferencia |= aa[i] ^ bb[i];
  return diferencia === 0;
}

const demorarFalloLogin = () => new Promise<void>((resolve) => setTimeout(resolve, 650));

/** HMAC-SHA256 del valor con el secreto de sesión. Devuelve hex. */
async function firmar(valor: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(ADMIN_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(valor));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Crea la cookie de sesión si la contraseña es correcta. */
export async function iniciarSesionAdmin(password: string): Promise<boolean> {
  // Sin ADMIN_PASSWORD configurada (env), el panel queda CERRADO: nunca se
  // acepta un login (no existe más el default hardcodeado en el repo).
  const ahora = Date.now();
  const clave = await identificadorLogin();
  const previo = intentosLogin.get(clave);
  if (previo && previo.bloqueadoHasta > ahora) {
    await demorarFalloLogin();
    return false;
  }

  const candidato = typeof password === "string" && password.length <= 512 ? password : "";
  const correcto = Boolean(ADMIN_PASSWORD) && await secretosIguales(candidato, ADMIN_PASSWORD);
  if (!correcto) {
    const vigente = previo && previo.ventanaHasta > ahora
      ? previo
      : { fallos: 0, ventanaHasta: ahora + VENTANA_LOGIN_MS, bloqueadoHasta: 0 };
    vigente.fallos += 1;
    if (vigente.fallos >= MAX_FALLOS_LOGIN) vigente.bloqueadoHasta = ahora + VENTANA_LOGIN_MS;
    intentosLogin.set(clave, vigente);
    if (intentosLogin.size > MAX_IDENTIFICADORES_LOGIN) {
      for (const [id, intento] of intentosLogin) {
        if (intento.ventanaHasta <= ahora && intento.bloqueadoHasta <= ahora) intentosLogin.delete(id);
      }
      // Un atacante puede rotar direcciones/headers más rápido que la ventana.
      // Mantener un límite duro evita convertir el throttle en un DoS de memoria.
      while (intentosLogin.size > MAX_IDENTIFICADORES_LOGIN) {
        const masAntiguo = intentosLogin.keys().next().value as string | undefined;
        if (!masAntiguo) break;
        intentosLogin.delete(masAntiguo);
      }
    }
    await demorarFalloLogin();
    return false;
  }
  intentosLogin.delete(clave);
  const expira = Date.now() + DURACION_MS;
  const firma = await firmar(String(expira));
  const valor = `${expira}.${firma}`;
  (await cookies()).set(COOKIE_NAME, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_MS / 1000,
  });
  return true;
}

/** Cierra la sesión eliminando la cookie. */
export async function cerrarSesionAdmin(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/** ¿Hay una sesión de admin válida (cookie presente y firma correcta)? */
export async function sesionValida(): Promise<boolean> {
  // Con secreto vacío, un atacante podría calcular por su cuenta el HMAC de
  // una fecha futura. El panel debe permanecer cerrado si falta cualquiera de
  // las dos credenciales administrativas.
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) return false;
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const partes = raw.split(".");
  if (partes.length !== 2) return false;
  const [expiraStr, firma] = partes;
  if (!/^\d{13}$/.test(expiraStr) || !/^[0-9a-f]{64}$/.test(firma)) return false;
  const expira = Number(expiraStr);
  const ahora = Date.now();
  if (!Number.isFinite(expira) || expira < ahora || expira > ahora + DURACION_MS) return false;
  const esperada = await firmar(expiraStr);
  return secretosIguales(esperada, firma);
}
