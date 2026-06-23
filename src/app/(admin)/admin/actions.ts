"use server";

import { revalidatePath } from "next/cache";
import {
  supabaseAdmin,
  adminConfigurado,
  sesionValida,
  iniciarSesionAdmin,
  cerrarSesionAdmin,
} from "@/lib/supabase-admin";
import { Perfume, Cupon, TiendaProducto } from "@/types/database";
import { FALLBACK_PERFUMES } from "@/data/fallback-perfumes";
import {
  getSheetsClient,
  googleSheetsConfigurado,
  GOOGLE_SHEET_ID,
} from "@/lib/google-sheets";

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
  /** Tiendas/proveedores externos donde también se consigue el producto. */
  tiendas: TiendaProducto[];
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

/**
 * Limpia el array de tiendas que viene del formulario:
 * descarta filas vacías (sin tienda ni url ni código) y recorta los campos.
 * Así no se guarda basura del tipo { tienda: "", url: "", codigo: "" }.
 */
function normalizarTiendas(tiendas: TiendaProducto[] | undefined | null): TiendaProducto[] {
  if (!Array.isArray(tiendas)) return [];
  return tiendas
    .map((t) => ({
      tienda: String(t?.tienda ?? "").trim(),
      url:    String(t?.url ?? "").trim(),
      codigo: String(t?.codigo ?? "").trim(),
    }))
    .filter((t) => t.tienda || t.url || t.codigo);
}

/**
 * Borra de Google Sheets la fila del producto en la pestaña "Hoja 1",
 * buscándola por el id en la columna A. Best-effort: nunca lanza.
 */
async function borrarFilaSheets(id: string): Promise<void> {
  const sheets = await getSheetsClient();

  // 1) Encontrar el índice base-0 de la fila cuyo valor en la columna A === id.
  const lectura = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "A:A",
  });
  const valores = lectura.data.values ?? [];
  let idx = -1;
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i]?.[0] ?? "").trim() === id) { idx = i; break; }
  }
  if (idx === -1) return; // no está en la planilla → nada que borrar

  // 2) Resolver el sheetId (gid) numérico de "Hoja 1".
  const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
  const hoja = meta.data.sheets?.find((s) => s.properties?.title === "Hoja 1");
  const gid = hoja?.properties?.sheetId;
  if (gid == null) return; // sin gid no podemos borrar la dimensión

  // 3) Borrar la fila completa (deleteDimension reajusta las fórmulas de abajo).
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId: gid, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 },
          },
        },
      ],
    },
  });
}

/**
 * Escribe las tiendas de un producto en la columna J de su fila de la Sheet.
 *
 *  · Si el producto YA tiene fila (existe el id en la columna A) → actualiza
 *    SOLO la columna J con el JSON de tiendas.
 *  · Si NO tiene fila (producto nuevo de stock local) → agrega una fila
 *    completa con las fórmulas de precio (igual que el botón "Sincronizar
 *    planilla" de /api/sheets/sync) más las tiendas en J.
 *
 * Columnas: A id · B sku · C nombre · D marca · E costo · F margen ·
 *           G cotización · H precio venta (fórmula) · I ganancia (fórmula) ·
 *           J tiendas (JSON).
 *
 * Best-effort: nunca lanza (el llamador la envuelve en try/catch).
 */
async function sincronizarTiendasSheets(
  id: string,
  sku: string | null,
  nombre: string,
  marca: string,
  tiendas: TiendaProducto[]
): Promise<void> {
  const sheets = await getSheetsClient();

  // 1) ¿Existe ya la fila del producto? (buscar por id en la columna A)
  const lectura = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "A:A",
  });
  const valores = lectura.data.values ?? [];
  let fila1 = -1; // número de fila 1-based
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i]?.[0] ?? "").trim() === id) { fila1 = i + 1; break; }
  }

  // JSON de tiendas (vacío → celda en blanco para no romper con "[]" literal).
  const jsonTiendas = tiendas.length > 0 ? JSON.stringify(tiendas) : "";

  if (fila1 > 0) {
    // 2a) Ya existe → actualizar solo la columna J (tiendas).
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `J${fila1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[jsonTiendas]] },
    });
    return;
  }

  // 2b) No existe → append de una fila completa con fórmulas de precio.
  //     Estas fórmulas espejan a /api/sheets/sync (POST) para que la fila quede
  //     consistente y un sync posterior no la duplique.
  const proximaFila = valores.length + 1;
  const cotizacionRef = "='Cotizaciones'!$A$2";
  const formulaPrecioVenta =
    `=REDONDEAR(((E${proximaFila} * (1 + F${proximaFila})) * G${proximaFila}); -3)`;
  const formulaGanancia = `=H${proximaFila} - (E${proximaFila} * G${proximaFila})`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        id,
        sku ?? "",
        nombre,
        marca,
        "", "",              // E (costo) y F (margen): los carga el dueño a mano
        cotizacionRef,       // G: cotización automática desde la pestaña Cotizaciones
        formulaPrecioVenta,  // H: precio de venta
        formulaGanancia,     // I: ganancia
        jsonTiendas,         // J: tiendas (JSON)
      ]],
    },
  });
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
//  Subida de imágenes de producto a Supabase Storage (bucket público "productos")
// ────────────────────────────────────────────────────────────────────────────

const BUCKET_IMAGENES = "productos";
const TIPOS_IMG = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMG_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Sube una imagen al bucket público "productos" y devuelve su URL pública.
 * Recibe un FormData con el campo "file". Usa la service role (saltea RLS).
 * Lo consume <ImageDrop> a través de onSubirImagen en el panel.
 */
export async function subirImagenProductoAction(
  formData: FormData
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requerirAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No se recibió ninguna imagen." };
  }
  if (!TIPOS_IMG.includes(file.type)) {
    return { ok: false, error: "Formato no permitido. Usá PNG, JPG o WebP." };
  }
  if (file.size > MAX_IMG_BYTES) {
    return { ok: false, error: "La imagen supera los 4 MB." };
  }

  const supabase = supabaseAdmin();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const ruta = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET_IMAGENES)
    .upload(ruta, buffer, { contentType: file.type, upsert: true });
  if (error) {
    console.error("[subirImagenProductoAction]", error.message);
    return { ok: false, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta);
  return { ok: true, url: data.publicUrl };
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
    tiendas:          normalizarTiendas(input.tiendas),
    sku:              skuFinal,
    destacado:        Boolean(input.destacado),
    es_dropi:         Boolean(input.es_dropi),
    // Los nuevos perfumes cargados por el admin nunca son demos
    es_demo:          false,
  };

  let error;
  let idProducto = input.id;
  if (input.id) {
    ({ error } = await supabase.from("perfumes").update(payload).eq("id", input.id));
  } else {
    const { data: insertado, error: errInsert } = await supabase
      .from("perfumes")
      .insert(payload)
      .select("id")
      .single();
    error = errInsert;
    if (insertado?.id) idProducto = insertado.id;
  }

  if (error) return { ok: false, error: error.message };

  // ── Sincronizar tiendas en la Google Sheet (best-effort) ──
  // Solo para stock local: la planilla es el inventario físico propio.
  // Los productos externos (Dropi) no viven en la planilla.
  if (idProducto && !Boolean(input.es_dropi) && googleSheetsConfigurado()) {
    try {
      await sincronizarTiendasSheets(
        idProducto,
        skuFinal,
        input.nombre.trim(),
        input.marca.trim(),
        normalizarTiendas(input.tiendas)
      );
    } catch (e) {
      console.error("[guardarPerfumeAction] sincronizar tiendas en Sheets:", e);
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

export async function eliminarPerfumeAction(id: string): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  // (Opcional) Antes de borrar, leer la url_imagen para poder limpiar Storage.
  let nombreArchivoImg: string | null = null;
  try {
    const { data: fila } = await supabase
      .from("perfumes")
      .select("url_imagen")
      .eq("id", id)
      .single();
    const urlImg = String(fila?.url_imagen ?? "");
    // Extrae el <archivo> si la URL es del bucket público "productos".
    const m = urlImg.match(/\/storage\/v1\/object\/public\/productos\/([^?#]+)/);
    if (m) nombreArchivoImg = decodeURIComponent(m[1]);
  } catch (e) {
    console.error("[eliminarPerfumeAction] leer url_imagen:", e);
  }

  // 1) Borrar de Supabase (operación principal).
  const { error } = await supabase.from("perfumes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  // 2) Best-effort: borrar la fila en la Google Sheet (pestaña "Hoja 1").
  if (googleSheetsConfigurado()) {
    try {
      await borrarFilaSheets(id);
    } catch (e) {
      console.error("[eliminarPerfumeAction] borrar fila de Sheets:", e);
    }
  }

  // 3) Best-effort: borrar la foto del bucket "productos" en Storage.
  if (nombreArchivoImg) {
    try {
      await supabase.storage.from(BUCKET_IMAGENES).remove([nombreArchivoImg]);
    } catch (e) {
      console.error("[eliminarPerfumeAction] borrar imagen de Storage:", e);
    }
  }

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

// ────────────────────────────────────────────────────────────────────────────
//  INICIALIZACIÓN · Cargar los perfumes de prueba a Supabase desde el panel
//  (Útil cuando la base está vacía y no querés correr SQL a mano)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Inserta los 11 perfumes de prueba (fallback) en Supabase, marcándolos como
 * es_demo = true. Usa upsert por SKU para no duplicar si ya existen.
 * Esto resuelve el caso en el que la tienda muestra los perfumes del
 * fallback local pero el panel /admin sale vacío.
 */
export async function inicializarDemosAction(): Promise<
  ActionResult & { cargados?: number }
> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  // Mapear el fallback al payload de inserción (sin id/created_at/updated_at
  // para que la base los genere)
  const payload = FALLBACK_PERFUMES.map((p) => ({
    nombre: p.nombre,
    marca: p.marca,
    precio_regular: p.precio_regular,
    precio_descuento: p.precio_descuento,
    en_oferta: p.en_oferta,
    stock_disponible: p.stock_disponible,
    volumen_ml: p.volumen_ml,
    activo: p.activo,
    url_imagen: p.url_imagen,
    descripcion: p.descripcion,
    notas_olfativas: p.notas_olfativas,
    categoria: p.categoria,
    tiendas: p.tiendas ?? [],
    sku: p.sku,
    destacado: p.destacado,
    es_dropi: false,
    es_demo: true,
    clicks_mensuales: 0,
  }));

  const { data, error } = await supabase
    .from("perfumes")
    .upsert(payload, { onConflict: "sku" })
    .select("id");

  if (error) {
    console.error("[inicializarDemosAction]", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return {
    ok: true,
    cargados: data?.length ?? payload.length,
  };
}

/**
 * Borra TODOS los perfumes marcados como demo (es_demo = true).
 * Útil para limpiar la base cuando ya cargaste tus productos reales.
 */
export async function borrarTodosLosDemosAction(): Promise<
  ActionResult & { borrados?: number }
> {
  await requerirAdmin();
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("perfumes")
    .delete()
    .eq("es_demo", true)
    .select("id");

  if (error) {
    console.error("[borrarTodosLosDemosAction]", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, borrados: data?.length ?? 0 };
}
