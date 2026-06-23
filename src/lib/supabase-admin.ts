import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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
  if (password !== ADMIN_PASSWORD) return false;
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
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const [expiraStr, firma] = raw.split(".");
  if (!expiraStr || !firma) return false;
  const expira = Number(expiraStr);
  if (!Number.isFinite(expira) || expira < Date.now()) return false;
  const esperada = await firmar(expiraStr);
  return esperada === firma;
}
