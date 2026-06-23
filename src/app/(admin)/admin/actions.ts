"use server";

import { revalidatePath } from "next/cache";
import {
  supabaseAdmin,
  adminConfigurado,
  sesionValida,
  iniciarSesionAdmin,
  cerrarSesionAdmin,
} from "@/lib/supabase-admin";
import { Perfume, Cupon } from "@/types/database";

// ────────────────────────────────────────────────────────────────────────────
//  Tipos de entrada (sin campos generados por la DB)
// ────────────────────────────────────────────────────────────────────────────

export interface PerfumeInput {
  id?: string;
  nombre: string;
  marca: string;
  precio_regular: number;
  precio_descuento: number | null;
  en_oferta: boolean;
  stock_disponible: number;
  volumen_ml: number;
  activo: boolean;
  url_imagen: string;
  descripcion: string;
  notas_olfativas: { salida: string[]; corazon: string[]; fondo: string[] };
  categoria: string[];
  sku: string | null;
  destacado: boolean;
  es_dropi: boolean;
}

type ActionResult = { ok: boolean; error?: string };

// ────────────────────────────────────────────────────────────────────────────
//  Auth
// ────────────────────────────────────────────────────────────────────────────

export async function loginAction(password: string): Promise<ActionResult> {
  const ok = await iniciarSesionAdmin(password);
  return ok ? { ok: true } : { ok: false, error: "Contraseña incorrecta." };
}

export async function logoutAction(): Promise<ActionResult> {
  await cerrarSesionAdmin();
  return { ok: true };
}

/** Guardián: lanza si no hay sesión válida o no hay service role. */
async function requerirAdmin() {
  if (!adminConfigurado()) {
    throw new Error("SUPABASE_NO_CONFIGURADO");
  }
  if (!(await sesionValida())) {
    throw new Error("NO_AUTORIZADO");
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Perfumes — CRUD
// ────────────────────────────────────────────────────────────────────────────

export async function guardarPerfumeAction(input: PerfumeInput): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  const payload = {
    nombre: input.nombre.trim(),
    marca: input.marca.trim(),
    precio_regular: Number(input.precio_regular),
    precio_descuento: input.precio_descuento == null ? null : Number(input.precio_descuento),
    en_oferta: Boolean(input.en_oferta),
    stock_disponible: Math.max(0, Number(input.stock_disponible)),
    volumen_ml: Number(input.volumen_ml) || 100,
    activo: Boolean(input.activo),
    url_imagen: input.url_imagen.trim(),
    descripcion: input.descripcion.trim(),
    notas_olfativas: input.notas_olfativas,
    categoria: input.categoria,
    sku: input.sku?.trim() || null,
    destacado: Boolean(input.destacado),
    es_dropi: Boolean(input.es_dropi),
  };

  let error;
  if (input.id) {
    ({ error } = await supabase.from("perfumes").update(payload).eq("id", input.id));
  } else {
    ({ error } = await supabase.from("perfumes").insert(payload));
  }

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

export async function eliminarPerfumeAction(id: string): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("perfumes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** Cambia +/- el stock de un perfume (control express de ventas en local). */
export async function ajustarStockAction(
  id: string,
  delta: number
): Promise<ActionResult & { stock?: number }> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  // Lectura del stock actual
  const { data, error: errRead } = await supabase
    .from("perfumes")
    .select("stock_disponible")
    .eq("id", id)
    .single();
  if (errRead || !data) return { ok: false, error: "No se pudo leer el stock." };

  const nuevo = Math.max(0, Number(data.stock_disponible) + delta);
  const { error } = await supabase
    .from("perfumes")
    .update({ stock_disponible: nuevo })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, stock: nuevo };
}

/** Toggle de activo / destacado. */
export async function togglePerfumeAction(
  id: string,
  campo: "activo" | "destacado",
  valor: boolean
): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("perfumes")
    .update({ [campo]: valor })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** Oculta todos los perfumes (útil para limpiar los de prueba). */
export async function ocultarTodosAction(ids: string[]): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("perfumes")
    .update({ activo: false })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  Cupones
// ────────────────────────────────────────────────────────────────────────────

export interface CuponInput {
  id?: string;
  codigo: string;
  porcentaje_descuento: number;
  activo: boolean;
  limite_usos: number;
  fecha_expiracion: string | null;
}

export async function guardarCuponAction(input: CuponInput): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const payload = {
    codigo: input.codigo.trim().toUpperCase(),
    porcentaje_descuento: Number(input.porcentaje_descuento),
    activo: Boolean(input.activo),
    limite_usos: Number(input.limite_usos),
    fecha_expiracion: input.fecha_expiracion || null,
  };
  let error;
  if (input.id) {
    ({ error } = await supabase.from("cupones").update(payload).eq("id", input.id));
  } else {
    ({ error } = await supabase.from("cupones").insert(payload));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleCuponAction(id: string, activo: boolean): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("cupones").update({ activo }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function eliminarCuponAction(id: string): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("cupones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  Carga de datos (Server Component)
// ────────────────────────────────────────────────────────────────────────────

export interface DatosAdmin {
  perfumes: Perfume[];
  cupones: Cupon[];
  configurado: boolean;
}

/**
 * Carga todos los perfumes (activos e inactivos) y cupones.
 * Si Supabase no está configurado, devuelve fallback vacío.
 */
export async function cargarDatosAdmin(): Promise<DatosAdmin> {
  if (!adminConfigurado()) {
    return { perfumes: [], cupones: [], configurado: false };
  }
  try {
    const supabase = supabaseAdmin();
    const [{ data: perfumesData, error: errP }, { data: cuponesData, error: errC }] =
      await Promise.all([
        supabase.from("perfumes").select("*").order("created_at", { ascending: true }),
        supabase.from("cupones").select("*").order("porcentaje_descuento", { ascending: false }),
      ]);

    if (errP || errC) {
      return { perfumes: [], cupones: [], configurado: true };
    }
    return {
      perfumes: (perfumesData ?? []) as unknown as Perfume[],
      cupones: (cuponesData ?? []) as unknown as Cupon[],
      configurado: true,
    };
  } catch {
    return { perfumes: [], cupones: [], configurado: false };
  }
}
