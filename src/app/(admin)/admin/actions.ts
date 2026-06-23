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

/**
 * Configuración de un proveedor de stock externo (ej: Dropi Paraguay).
 * Se persiste en la tabla `public.config_proveedores`.
 */
export interface ConfigProveedor {
  id: string;
  proveedor: string;          // "Dropi Paraguay", etc.
  api_url: string | null;     // URL base de la API
  api_key: string | null;     // Token de acceso (se enmascara en el cliente)
  sincronizar_diario: boolean; // automatizar lectura diaria de stock
  ultimo_sync: string | null;  // timestamp del último sync manual/automático
  updated_at: string;
}

export interface ConfigProveedorInput {
  proveedor: string;
  api_url: string;
  api_key: string;
  sincronizar_diario: boolean;
}

type ActionResult = { ok: boolean; error?: string };

export interface DatosAdmin {
  perfumes: Perfume[];
  cupones: Cupon[];
  configurado: boolean;
  top5: { id: string; nombre: string; clicks_mensuales: number }[];
  proveedor: ConfigProveedor | null;
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
//  Proveedor de stock externo (config_proveedores)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Guarda (upsert) la configuración del proveedor.
 * Si api_key llega como string enmascarado (•••), conserva el existente.
 */
export async function guardarProveedorAction(
  input: ConfigProveedorInput,
  idExistente?: string
): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  const payload: Record<string, unknown> = {
    proveedor: input.proveedor.trim(),
    api_url: input.api_url.trim() || null,
    sincronizar_diario: Boolean(input.sincronizar_diario),
    updated_at: new Date().toISOString(),
  };

  // Solo pisar api_key si llega un valor real (no enmascarado)
  if (input.api_key && !input.api_key.includes("•")) {
    payload.api_key = input.api_key.trim();
  }

  let error;
  if (idExistente) {
    ({ error } = await supabase
      .from("config_proveedores")
      .update(payload)
      .eq("id", idExistente));
  } else {
    ({ error } = await supabase.from("config_proveedores").insert(payload));
  }

  if (error) {
    console.error("[guardarProveedorAction]", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Fuerza una sincronización de stock ahora (manual).
 * Por ahora valida que la config esté presente; cuando se conecte la API real
 * de Dropi, este endpoint orquestará la lectura y el upsert de perfumes.
 */
export async function sincronizarProveedorAction(id: string): Promise<
  ActionResult & { sincronizados?: number; detalle?: string }
> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  // Verificar que la config exista y tenga credenciales
  const { data, error } = await supabase
    .from("config_proveedores")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    return { ok: false, error: "No se encontró la configuración del proveedor." };
  }
  if (!(data as ConfigProveedor).api_url || !(data as ConfigProveedor).api_key) {
    return {
      ok: false,
      error: "Faltan credenciales (URL y/o API Key). Guardalas primero.",
    };
  }

  // Actualizamos la marca de último sync. La lectura real de Dropi se
  // implementará cuando se confirmen los endpoints del proveedor.
  const { error: errUp } = await supabase
    .from("config_proveedores")
    .update({
      ultimo_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (errUp) {
    console.error("[sincronizarProveedorAction]", errUp.message);
    return { ok: false, error: errUp.message };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    sincronizados: 0,
    detalle:
      "Configuración validada y registrada. La sincronización real con el proveedor quedará activa apenas se confirmen los endpoints.",
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Carga de datos (Server Component)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Carga todos los datos del panel en flujos INDEPENDIENTES:
 * si una tabla falla (ej: cupones vacíos), las demás igual cargan.
 * Cada error se loguea con console.error para diagnóstico en Vercel.
 */
export async function cargarDatosAdmin(): Promise<DatosAdmin> {
  // Estado base si Supabase no está configurado
  if (!adminConfigurado()) {
    return { perfumes: [], cupones: [], configurado: false, top5: [], proveedor: null };
  }

  const supabase = supabaseAdmin();
  const base = { configurado: true } as DatosAdmin;

  // 1) Perfumes (CRÍTICO: si falla, igual devolvemos el resto)
  let perfumes: Perfume[] = [];
  try {
    const { data, error } = await supabase
      .from("perfumes")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[cargarDatosAdmin] Error leyendo perfumes:", error.message);
    } else {
      perfumes = (data ?? []) as unknown as Perfume[];
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo perfumes:", e);
  }

  // 2) Cupones (NO crítico: si falla, devolvemos [])
  let cupones: Cupon[] = [];
  try {
    const { data, error } = await supabase
      .from("cupones")
      .select("*")
      .order("porcentaje_descuento", { ascending: false });
    if (error) {
      console.error("[cargarDatosAdmin] Error leyendo cupones:", error.message);
    } else {
      cupones = (data ?? []) as unknown as Cupon[];
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo cupones:", e);
  }

  // 3) Top 5 por clicks_mensuales
  let top5: { id: string; nombre: string; clicks_mensuales: number }[] = [];
  try {
    const { data, error } = await supabase
      .from("perfumes")
      .select("id, nombre, clicks_mensuales")
      .order("clicks_mensuales", { ascending: false })
      .limit(5);
    if (error) {
      console.error("[cargarDatosAdmin] Error leyendo top5:", error.message);
    } else {
      top5 = (data ?? []) as { id: string; nombre: string; clicks_mensuales: number }[];
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo top5:", e);
  }

  // 4) Config del proveedor (NO crítico)
  let proveedor: ConfigProveedor | null = null;
  try {
    const { data, error } = await supabase
      .from("config_proveedores")
      .select("*")
      .limit(1)
      .single();
    if (error) {
      // PSQL cod 42P01 (tabla inexistente) → no es error fatal, solo no hay tabla aún
      console.error("[cargarDatosAdmin] Tabla config_proveedores:", error.message);
    } else if (data) {
      proveedor = data as unknown as ConfigProveedor;
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo proveedor:", e);
  }

  return { ...base, perfumes, cupones, top5, proveedor };
}
