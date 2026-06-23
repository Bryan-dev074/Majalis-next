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
//  Tipos de entrada / salida
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
  /** Dejar vacío para que el servidor lo genere: MARCA-NOMBRE-ML */
  sku: string | null;
  destacado: boolean;
  /** true = Origen Externo (depósito externo, pago contra entrega). Nunca se muestra al cliente como proveedor. */
  es_dropi: boolean;
}

export interface CuponInput {
  id?: string;
  codigo: string;
  porcentaje_descuento: number;
  activo: boolean;
  limite_usos: number;
  fecha_expiracion: string | null;
}

type ActionResult = { ok: boolean; error?: string };

export interface DatosAdmin {
  perfumes: Perfume[];
  cupones: Cupon[];
  configurado: boolean;
  top5: { id: string; nombre: string; clicks_mensuales: number }[];
}

// ────────────────────────────────────────────────────────────────────────────
//  Helper: generador de SKU
//  Estructura: MARCA_SLUG-NOMBRE_SLUG-VOLUMENml  →  LTTF-OUDMOOD-100
// ────────────────────────────────────────────────────────────────────────────

function generarSku(marca: string, nombre: string, volumen_ml: number): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar tildes
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "");

  const marcaSlug = slug(marca).slice(0, 6);
  const nombreSlug = slug(nombre).slice(0, 10);
  return `${marcaSlug}-${nombreSlug}-${volumen_ml}`;
}

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

async function requerirAdmin() {
  if (!adminConfigurado()) throw new Error("SUPABASE_NO_CONFIGURADO");
  if (!(await sesionValida())) throw new Error("NO_AUTORIZADO");
}

// ────────────────────────────────────────────────────────────────────────────
//  Perfumes — CRUD
// ────────────────────────────────────────────────────────────────────────────

export async function guardarPerfumeAction(input: PerfumeInput): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  // Auto-generar SKU si está vacío
  const skuFinal =
    input.sku?.trim() ||
    generarSku(input.marca, input.nombre, Number(input.volumen_ml) || 100);

  const payload = {
    nombre:           input.nombre.trim(),
    marca:            input.marca.trim(),
    precio_regular:   Number(input.precio_regular),
    precio_descuento: input.precio_descuento == null ? null : Number(input.precio_descuento),
    en_oferta:        Boolean(input.en_oferta),
    stock_disponible: Math.max(0, Number(input.stock_disponible)),
    volumen_ml:       Number(input.volumen_ml) || 100,
    activo:           Boolean(input.activo),
    url_imagen:       input.url_imagen.trim(),
    descripcion:      input.descripcion.trim(),
    notas_olfativas:  input.notas_olfativas,
    categoria:        input.categoria,
    sku:              skuFinal,
    destacado:        Boolean(input.destacado),
    es_dropi:         Boolean(input.es_dropi),
    // Los nuevos perfumes cargados por el admin nunca son demos
    es_demo:          false,
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

/** Ajusta +/- el stock directamente (control express desde la tabla). */
export async function ajustarStockAction(
  id: string,
  delta: number
): Promise<ActionResult & { stock?: number }> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
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

/** Oculta en bloque (útil para los perfumes de prueba/demo del sistema). */
export async function ocultarTodosAction(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { ok: true };
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

/** Muestra en bloque (para restaurar perfumes de prueba si se necesita). */
export async function mostrarTodosAction(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { ok: true };
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("perfumes")
    .update({ activo: true })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** Resetea los clicks_mensuales de todos los perfumes (inicio de mes). */
export async function resetearClicksAction(): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("perfumes")
    .update({ clicks_mensuales: 0 })
    .gte("clicks_mensuales", 0); // afecta a todos
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  Cupones
// ────────────────────────────────────────────────────────────────────────────

export async function guardarCuponAction(input: CuponInput): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const payload = {
    codigo:               input.codigo.trim().toUpperCase(),
    porcentaje_descuento: Number(input.porcentaje_descuento),
    activo:               Boolean(input.activo),
    limite_usos:          Number(input.limite_usos),
    fecha_expiracion:     input.fecha_expiracion || null,
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

/**
 * Carga todos los perfumes (activos e inactivos), cupones y Top-5 del mes.
 * Si Supabase no está configurado, devuelve vacío con configurado: false.
 */
export async function cargarDatosAdmin(): Promise<DatosAdmin> {
  if (!adminConfigurado()) {
    return { perfumes: [], cupones: [], configurado: false, top5: [] };
  }
  try {
    const supabase = supabaseAdmin();
    const [
      { data: perfumesData, error: errP },
      { data: cuponesData, error: errC },
      { data: top5Data },
    ] = await Promise.all([
      supabase.from("perfumes").select("*").order("created_at", { ascending: true }),
      supabase.from("cupones").select("*").order("porcentaje_descuento", { ascending: false }),
      supabase
        .from("perfumes")
        .select("id, nombre, clicks_mensuales")
        .order("clicks_mensuales", { ascending: false })
        .limit(5),
    ]);

    if (errP || errC) {
      return { perfumes: [], cupones: [], configurado: true, top5: [] };
    }
    return {
      perfumes:  (perfumesData ?? []) as unknown as Perfume[],
      cupones:   (cuponesData ?? []) as unknown as Cupon[],
      configurado: true,
      top5: (top5Data ?? []) as { id: string; nombre: string; clicks_mensuales: number }[],
    };
  } catch {
    return { perfumes: [], cupones: [], configurado: false, top5: [] };
  }
}
