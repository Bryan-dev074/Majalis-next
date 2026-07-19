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
  /**
   * Valores vistos al abrir una edición. El servidor los usa como precondición
   * para no sobrescribir un precio/stock que el scraper cambió entre tanto.
   * No se usa `updated_at` porque el contador de clics también lo modifica.
   */
  valores_originales?: {
    precio_regular: number;
    precio_descuento: number | null;
    en_oferta: boolean;
    stock_disponible: number;
    activo: boolean;
  };
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

type ActionResult = { ok: boolean; error?: string; partial?: boolean };

type Validacion<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRECIO = Number.MAX_SAFE_INTEGER;
const MAX_STOCK = 10_000_000;
const MAX_IDS_MASIVOS = 10_000;
const TAMANO_LOTE_IDS = 200;
const MAX_DEMOS_A_BORRAR = 100;

function errorValidacion<T>(error: string): Validacion<T> {
  return { ok: false, error };
}

function validarUuid(valor: unknown, etiqueta = "ID"): Validacion<string> {
  if (typeof valor !== "string" || !UUID_RE.test(valor)) {
    return errorValidacion(`${etiqueta} inválido.`);
  }
  return { ok: true, valor: valor.toLowerCase() };
}

function validarBooleano(valor: unknown, etiqueta: string): Validacion<boolean> {
  return typeof valor === "boolean"
    ? { ok: true, valor }
    : errorValidacion(`${etiqueta} debe ser verdadero o falso.`);
}

function validarEntero(
  valor: unknown,
  etiqueta: string,
  minimo: number,
  maximo: number
): Validacion<number> {
  if (
    typeof valor !== "number" ||
    !Number.isSafeInteger(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    return errorValidacion(`${etiqueta} debe ser un número entero entre ${minimo} y ${maximo}.`);
  }
  return { ok: true, valor };
}

function validarTexto(
  valor: unknown,
  etiqueta: string,
  maximo: number,
  opciones: { requerido?: boolean; multilinea?: boolean } = {}
): Validacion<string> {
  if (typeof valor !== "string") return errorValidacion(`${etiqueta} inválido.`);
  const texto = valor.trim();
  if ((opciones.requerido ?? true) && !texto) {
    return errorValidacion(`${etiqueta} es obligatorio.`);
  }
  if (texto.length > maximo) {
    return errorValidacion(`${etiqueta} supera el máximo de ${maximo} caracteres.`);
  }
  const controles = opciones.multilinea
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/;
  if (controles.test(texto)) return errorValidacion(`${etiqueta} contiene caracteres inválidos.`);
  return { ok: true, valor: texto };
}

function validarListaTextos(
  valor: unknown,
  etiqueta: string,
  maxItems: number,
  maxCaracteres: number
): Validacion<string[]> {
  if (!Array.isArray(valor) || valor.length > maxItems) {
    return errorValidacion(`${etiqueta} debe contener como máximo ${maxItems} elementos.`);
  }
  const salida: string[] = [];
  const vistos = new Set<string>();
  for (const item of valor) {
    const texto = validarTexto(item, etiqueta, maxCaracteres, { requerido: false });
    if (!texto.ok) return texto;
    if (!texto.valor || vistos.has(texto.valor)) continue;
    vistos.add(texto.valor);
    salida.push(texto.valor);
  }
  return { ok: true, valor: salida };
}

function validarUrlHttp(valor: string, etiqueta: string): Validacion<string> {
  if (!valor) return { ok: true, valor };
  if (valor.length > 2_048) return errorValidacion(`${etiqueta} es demasiado larga.`);
  try {
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return errorValidacion(`${etiqueta} debe ser una URL HTTP o HTTPS válida.`);
    }
    return { ok: true, valor };
  } catch {
    return errorValidacion(`${etiqueta} debe ser una URL válida.`);
  }
}

function extraerRutaImagenPropia(valor: string): string | null {
  try {
    const url = new URL(valor);
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || url.origin !== new URL(supabaseUrl).origin) return null;
    const prefijo = "/storage/v1/object/public/productos/";
    if (!url.pathname.startsWith(prefijo)) return null;
    const ruta = decodeURIComponent(url.pathname.slice(prefijo.length));
    if (!ruta || ruta.startsWith("/") || ruta.split("/").includes("..")) return null;
    return ruta;
  } catch {
    return null;
  }
}

function validarIdsMasivos(valor: unknown): Validacion<string[]> {
  if (!Array.isArray(valor)) return errorValidacion("La lista de perfumes es inválida.");
  if (valor.length > MAX_IDS_MASIVOS) {
    return errorValidacion(`La operación admite como máximo ${MAX_IDS_MASIVOS} perfumes.`);
  }
  const ids = new Set<string>();
  for (const item of valor) {
    const id = validarUuid(item, "ID de perfume");
    if (!id.ok) return id;
    ids.add(id.valor);
  }
  return { ok: true, valor: [...ids] };
}

function dividirEnLotes<T>(items: T[], tamano = TAMANO_LOTE_IDS): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

interface PerfumeNormalizado {
  id?: string;
  valores_originales?: {
    precio_regular: number;
    precio_descuento: number | null;
    en_oferta: boolean;
    stock_disponible: number;
    activo: boolean;
  };
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
  tiendas: TiendaProducto[];
  sku: string;
  destacado: boolean;
  es_dropi: boolean;
}

function validarPerfumeInput(input: unknown): Validacion<PerfumeNormalizado> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorValidacion("Los datos del perfume son inválidos.");
  }
  const raw = input as Record<string, unknown>;
  const id = raw.id == null ? undefined : validarUuid(raw.id, "ID de perfume");
  if (id && !id.ok) return id;
  let valoresOriginales: PerfumeNormalizado["valores_originales"];
  if (id?.ok) {
    const originalesRaw = raw.valores_originales;
    if (!originalesRaw || typeof originalesRaw !== "object" || Array.isArray(originalesRaw)) {
      return errorValidacion(
        "Falta la versión original del precio y stock. Recargá el panel antes de editar."
      );
    }
    const originales = originalesRaw as Record<string, unknown>;
    const precioRegularOriginal = validarEntero(
      originales.precio_regular,
      "El precio regular original",
      0,
      MAX_PRECIO
    );
    if (!precioRegularOriginal.ok) return precioRegularOriginal;
    const precioDescuentoOriginal = originales.precio_descuento == null
      ? ({ ok: true, valor: null } as const)
      : validarEntero(
          originales.precio_descuento,
          "El precio con descuento original",
          0,
          MAX_PRECIO
        );
    if (!precioDescuentoOriginal.ok) return precioDescuentoOriginal;
    const ofertaOriginal = validarBooleano(originales.en_oferta, "La oferta original");
    if (!ofertaOriginal.ok) return ofertaOriginal;
    const stockOriginal = validarEntero(
      originales.stock_disponible,
      "El stock original",
      0,
      MAX_STOCK
    );
    if (!stockOriginal.ok) return stockOriginal;
    const activoOriginal = validarBooleano(originales.activo, "La visibilidad original");
    if (!activoOriginal.ok) return activoOriginal;
    valoresOriginales = {
      precio_regular: precioRegularOriginal.valor,
      precio_descuento: precioDescuentoOriginal.valor,
      en_oferta: ofertaOriginal.valor,
      stock_disponible: stockOriginal.valor,
      activo: activoOriginal.valor,
    };
  }
  const nombre = validarTexto(raw.nombre, "El nombre", 200);
  if (!nombre.ok) return nombre;
  const marca = validarTexto(raw.marca, "La marca", 120);
  if (!marca.ok) return marca;
  const precioRegular = validarEntero(raw.precio_regular, "El precio regular", 1, MAX_PRECIO);
  if (!precioRegular.ok) return precioRegular;
  const precioDescuento = raw.precio_descuento == null
    ? ({ ok: true, valor: null } as const)
    : validarEntero(raw.precio_descuento, "El precio con descuento", 1, MAX_PRECIO);
  if (!precioDescuento.ok) return precioDescuento;
  if (precioDescuento.valor != null && precioDescuento.valor >= precioRegular.valor) {
    return errorValidacion("El precio con descuento debe ser menor al precio regular.");
  }
  const enOferta = validarBooleano(raw.en_oferta, "En oferta");
  if (!enOferta.ok) return enOferta;
  if (enOferta.valor && precioDescuento.valor == null) {
    return errorValidacion("Un perfume en oferta debe tener precio con descuento.");
  }
  const stock = validarEntero(raw.stock_disponible, "El stock", 0, MAX_STOCK);
  if (!stock.ok) return stock;
  const volumen = validarEntero(raw.volumen_ml, "El volumen", 1, 10_000);
  if (!volumen.ok) return volumen;
  const activo = validarBooleano(raw.activo, "Activo");
  if (!activo.ok) return activo;
  const destacado = validarBooleano(raw.destacado, "Destacado");
  if (!destacado.ok) return destacado;
  const esDropi = validarBooleano(raw.es_dropi, "Origen externo");
  if (!esDropi.ok) return esDropi;
  const descripcion = validarTexto(raw.descripcion, "La descripción", 10_000, { multilinea: true });
  if (!descripcion.ok) return descripcion;
  const imagen = validarTexto(raw.url_imagen, "La URL de imagen", 2_048, { requerido: false });
  if (!imagen.ok) return imagen;
  if (imagen.valor.startsWith("//")) {
    return errorValidacion("La URL de imagen relativa no puede apuntar a otro dominio.");
  }
  if (imagen.valor && !imagen.valor.startsWith("/")) {
    const urlImagen = validarUrlHttp(imagen.valor, "La URL de imagen");
    if (!urlImagen.ok) return urlImagen;
  }

  if (!raw.notas_olfativas || typeof raw.notas_olfativas !== "object" || Array.isArray(raw.notas_olfativas)) {
    return errorValidacion("Las notas olfativas son inválidas.");
  }
  const notasRaw = raw.notas_olfativas as Record<string, unknown>;
  const salida = validarListaTextos(notasRaw.salida, "Las notas de salida", 30, 80);
  if (!salida.ok) return salida;
  const corazon = validarListaTextos(notasRaw.corazon, "Las notas de corazón", 30, 80);
  if (!corazon.ok) return corazon;
  const fondo = validarListaTextos(notasRaw.fondo, "Las notas de fondo", 30, 80);
  if (!fondo.ok) return fondo;
  const categoria = validarListaTextos(raw.categoria, "Las categorías", 20, 60);
  if (!categoria.ok) return categoria;

  if (!Array.isArray(raw.tiendas) || raw.tiendas.length > 25) {
    return errorValidacion("Las tiendas deben contener como máximo 25 elementos.");
  }
  const tiendas: TiendaProducto[] = [];
  for (const [indice, item] of raw.tiendas.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return errorValidacion(`La tienda ${indice + 1} es inválida.`);
    }
    const tiendaRaw = item as Record<string, unknown>;
    const tienda = validarTexto(tiendaRaw.tienda ?? "", `El nombre de la tienda ${indice + 1}`, 120, { requerido: false });
    if (!tienda.ok) return tienda;
    const url = validarTexto(tiendaRaw.url ?? "", `La URL de la tienda ${indice + 1}`, 2_048, { requerido: false });
    if (!url.ok) return url;
    const codigo = validarTexto(tiendaRaw.codigo ?? "", `El código de la tienda ${indice + 1}`, 200, { requerido: false });
    if (!codigo.ok) return codigo;
    if (!tienda.valor && !url.valor && !codigo.valor) continue;
    const urlValidada = validarUrlHttp(url.valor, `La URL de la tienda ${indice + 1}`);
    if (!urlValidada.ok) return urlValidada;
    tiendas.push({ tienda: tienda.valor, url: urlValidada.valor, codigo: codigo.valor });
  }

  const skuIngresado = validarTexto(raw.sku ?? "", "El SKU", 120, { requerido: false });
  if (!skuIngresado.ok) return skuIngresado;
  const sku = skuIngresado.valor || generarSku(marca.valor, nombre.valor, volumen.valor);

  return {
    ok: true,
    valor: {
      id: id?.valor,
      valores_originales: valoresOriginales,
      nombre: nombre.valor,
      marca: marca.valor,
      precio_regular: precioRegular.valor,
      precio_descuento: precioDescuento.valor,
      en_oferta: enOferta.valor,
      stock_disponible: stock.valor,
      volumen_ml: volumen.valor,
      activo: activo.valor,
      url_imagen: imagen.valor,
      descripcion: descripcion.valor,
      notas_olfativas: { salida: salida.valor, corazon: corazon.valor, fondo: fondo.valor },
      categoria: categoria.valor,
      tiendas,
      sku,
      destacado: destacado.valor,
      es_dropi: esDropi.valor,
    },
  };
}

export interface DatosAdmin {
  perfumes: Perfume[];
  cupones: Cupon[];
  configurado: boolean;
  top5: { id: string; nombre: string; clicks_mensuales: number }[];
  /** Errores visibles: nunca presentar una carga incompleta como si estuviera completa. */
  erroresCarga: string[];
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
 * Borra de Google Sheets la fila del producto en la pestaña "Hoja 1",
 * buscándola por el id en la columna A.
 */
async function borrarFilaSheets(id: string): Promise<void> {
  const sheets = await getSheetsClient();

  // 1) Encontrar el índice base-0 de la fila cuyo valor en la columna A === id.
  const lectura = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "'Hoja 1'!A:A",
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
  if (gid == null) throw new Error('No existe la pestaña "Hoja 1" en Google Sheets.');

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
 * Si Google rechaza la escritura, lanza para que el llamador pueda informar que
 * Supabase quedó guardado pero la planilla no.
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
    range: "'Hoja 1'!A:A",
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
      range: `'Hoja 1'!J${fila1}`,
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
    range: "'Hoja 1'!A1",
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

function detectarImagen(buffer: Buffer): { contentType: string; extension: string } | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

/**
 * Sube una imagen al bucket público "productos" y devuelve su URL pública.
 * Recibe un FormData con el campo "file". Usa la service role (saltea RLS).
 * Lo consume <ImageDrop> a través de onSubirImagen en el panel.
 */
export async function subirImagenProductoAction(
  formData: FormData
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requerirAdmin();

  if (!(formData instanceof FormData)) {
    return { ok: false, error: "Los datos de la imagen son inválidos." };
  }
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
  const buffer = Buffer.from(await file.arrayBuffer());
  const imagen = detectarImagen(buffer);
  if (!imagen || (file.type === "image/png" && imagen.contentType !== "image/png") ||
      (["image/jpeg", "image/jpg"].includes(file.type) && imagen.contentType !== "image/jpeg") ||
      (file.type === "image/webp" && imagen.contentType !== "image/webp")) {
    return { ok: false, error: "El contenido del archivo no coincide con una imagen válida." };
  }
  const ruta = `${crypto.randomUUID()}.${imagen.extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_IMAGENES)
    .upload(ruta, buffer, { contentType: imagen.contentType, upsert: false });
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
  const validacion = validarPerfumeInput(input);
  if (!validacion.ok) return { ok: false, error: validacion.error };
  const perfume = validacion.valor;
  const supabase = supabaseAdmin();

  const payload = {
    nombre: perfume.nombre,
    marca: perfume.marca,
    precio_regular: perfume.precio_regular,
    precio_descuento: perfume.precio_descuento,
    en_oferta: perfume.en_oferta,
    stock_disponible: perfume.stock_disponible,
    volumen_ml: perfume.volumen_ml,
    activo: perfume.activo,
    url_imagen: perfume.url_imagen,
    descripcion: perfume.descripcion,
    notas_olfativas: perfume.notas_olfativas,
    categoria: perfume.categoria,
    tiendas: perfume.tiendas,
    sku: perfume.sku,
    destacado: perfume.destacado,
    es_dropi: perfume.es_dropi,
  };

  let error;
  let idProducto = perfume.id;
  if (perfume.id) {
    // No tocar es_demo al editar: esa clasificación pertenece a la fila actual
    // y no forma parte del formulario. Antes, cualquier edición promovía un
    // demo a producto real sin avisar.
    const originales = perfume.valores_originales!;
    let query = supabase
      .from("perfumes")
      .update(payload, { count: "exact" })
      .eq("id", perfume.id)
      .eq("precio_regular", originales.precio_regular)
      .eq("en_oferta", originales.en_oferta)
      .eq("stock_disponible", originales.stock_disponible)
      .eq("activo", originales.activo);
    query = originales.precio_descuento == null
      ? query.is("precio_descuento", null)
      : query.eq("precio_descuento", originales.precio_descuento);
    const { data: actualizado, error: errUpdate } = await query
      .select("id")
      .maybeSingle();
    error = errUpdate;
    idProducto = actualizado?.id;
  } else {
    const { data: insertado, error: errInsert } = await supabase
      .from("perfumes")
      // Solo los productos NUEVOS creados por el admin nacen como no-demo.
      .insert({ ...payload, es_demo: false })
      .select("id")
      .single();
    error = errInsert;
    if (insertado?.id) idProducto = insertado.id;
  }

  if (error) return { ok: false, error: error.message };
  if (!idProducto) {
    return {
      ok: false,
      error: perfume.id
        ? "El precio, el stock o la visibilidad cambió mientras editabas. Recargá el panel y revisá los valores antes de guardar."
        : "Supabase no devolvió el ID del perfume creado.",
    };
  }

  // ── Sincronizar tiendas en la Google Sheet ──
  // Solo para stock local: la planilla es el inventario físico propio.
  // Los productos externos (Dropi) no viven en la planilla.
  let errorSheet: string | null = null;
  if (idProducto && !perfume.es_dropi && googleSheetsConfigurado()) {
    try {
      await sincronizarTiendasSheets(
        idProducto,
        perfume.sku,
        perfume.nombre,
        perfume.marca,
        perfume.tiendas
      );
    } catch (e) {
      console.error("[guardarPerfumeAction] sincronizar tiendas en Sheets:", e);
      errorSheet = e instanceof Error ? e.message : "Error desconocido de Google Sheets.";
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");
  if (errorSheet) {
    return {
      ok: false,
      partial: true,
      error: `El perfume sí quedó guardado en Supabase, pero Google Sheets no se pudo actualizar: ${errorSheet}`,
    };
  }
  return { ok: true };
}

export async function eliminarPerfumeAction(id: string): Promise<ActionResult> {
  await requerirAdmin();
  const idValido = validarUuid(id, "ID de perfume");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const supabase = supabaseAdmin();

  // Antes de borrar, leer la fila para validar que existe y poder limpiar Storage.
  let nombreArchivoImg: string | null = null;
  const { data: fila, error: errorLectura } = await supabase
    .from("perfumes")
    .select("url_imagen")
    .eq("id", idValido.valor)
    .maybeSingle();
  if (errorLectura) return { ok: false, error: errorLectura.message };
  if (!fila) return { ok: false, error: "El perfume ya no existe en Supabase." };
  const urlImg = String(fila.url_imagen ?? "");
  nombreArchivoImg = extraerRutaImagenPropia(urlImg);

  // 1) Borrar de Supabase (operación principal).
  const { data: borrado, error } = await supabase
    .from("perfumes")
    .delete({ count: "exact" })
    .eq("id", idValido.valor)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!borrado || borrado.length !== 1) {
    return { ok: false, error: "Supabase no confirmó la eliminación del perfume." };
  }

  const erroresSecundarios: string[] = [];

  // 2) Borrar la fila en la Google Sheet (pestaña "Hoja 1").
  if (googleSheetsConfigurado()) {
    try {
      await borrarFilaSheets(idValido.valor);
    } catch (e) {
      console.error("[eliminarPerfumeAction] borrar fila de Sheets:", e);
      erroresSecundarios.push(
        `Google Sheets: ${e instanceof Error ? e.message : "error desconocido"}`
      );
    }
  }

  // 3) Borrar la foto del bucket "productos" en Storage y validar la respuesta.
  if (nombreArchivoImg) {
    // Variantes del mismo perfume pueden compartir exactamente el mismo objeto.
    // Solo se elimina cuando ninguna otra fila sigue apuntando a esa URL.
    const { data: otraReferencia, error: errorReferencias } = await supabase
      .from("perfumes")
      .select("id")
      .eq("url_imagen", urlImg)
      .limit(1)
      .maybeSingle();
    if (errorReferencias) {
      console.error("[eliminarPerfumeAction] comprobar imagen compartida:", errorReferencias.message);
      erroresSecundarios.push(`verificación de imagen en Storage: ${errorReferencias.message}`);
    } else if (!otraReferencia) {
      const { error: errorStorage } = await supabase.storage
        .from(BUCKET_IMAGENES)
        .remove([nombreArchivoImg]);
      if (errorStorage) {
        console.error("[eliminarPerfumeAction] borrar imagen de Storage:", errorStorage.message);
        erroresSecundarios.push(`imagen en Storage: ${errorStorage.message}`);
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");
  if (erroresSecundarios.length > 0) {
    return {
      ok: false,
      partial: true,
      error: `El perfume sí se eliminó de Supabase, pero quedó limpieza pendiente en ${erroresSecundarios.join("; ")}.`,
    };
  }
  return { ok: true };
}

/** Ajusta +/- el stock directamente (control express desde la tabla). */
export async function ajustarStockAction(
  id: string,
  delta: number
): Promise<ActionResult & { stock?: number }> {
  await requerirAdmin();
  const idValido = validarUuid(id, "ID de perfume");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const deltaValido = validarEntero(delta, "El ajuste de stock", -1_000, 1_000);
  if (!deltaValido.ok || deltaValido.valor === 0) {
    return {
      ok: false,
      error: deltaValido.ok ? "El ajuste de stock no puede ser cero." : deltaValido.error,
    };
  }
  const supabase = supabaseAdmin();

  // Compare-and-swap: si otro clic cambió el stock entre la lectura y el
  // UPDATE, esta escritura afecta cero filas y se vuelve a calcular. Así dos
  // incrementos simultáneos no se pisan entre sí.
  for (let intento = 0; intento < 4; intento += 1) {
    const { data, error: errRead } = await supabase
      .from("perfumes")
      .select("stock_disponible")
      .eq("id", idValido.valor)
      .maybeSingle();
    if (errRead) return { ok: false, error: errRead.message };
    if (!data) return { ok: false, error: "El perfume ya no existe." };

    const actual = Number(data.stock_disponible);
    if (!Number.isSafeInteger(actual) || actual < 0 || actual > MAX_STOCK) {
      return { ok: false, error: "El stock guardado tiene un valor inválido." };
    }
    const nuevo = Math.max(0, actual + deltaValido.valor);
    if (!Number.isSafeInteger(nuevo) || nuevo > MAX_STOCK) {
      return { ok: false, error: `El stock no puede superar ${MAX_STOCK}.` };
    }
    if (nuevo === actual) return { ok: true, stock: actual };

    const { data: actualizado, error } = await supabase
      .from("perfumes")
      .update({ stock_disponible: nuevo }, { count: "exact" })
      .eq("id", idValido.valor)
      .eq("stock_disponible", actual)
      .select("stock_disponible")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (actualizado) {
      revalidatePath("/");
      revalidatePath("/admin");
      return { ok: true, stock: Number(actualizado.stock_disponible) };
    }
  }

  return { ok: false, error: "El stock cambió varias veces al mismo tiempo. Volvé a intentar." };
}

/** Toggle de activo / destacado. */
export async function togglePerfumeAction(
  id: string,
  campo: "activo" | "destacado",
  valor: boolean
): Promise<ActionResult> {
  await requerirAdmin();
  if (campo !== "activo" && campo !== "destacado") {
    return { ok: false, error: "El campo que se intentó cambiar no está permitido." };
  }
  const idValido = validarUuid(id, "ID de perfume");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const valorValido = validarBooleano(valor, "El valor");
  if (!valorValido.ok) return { ok: false, error: valorValido.error };
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("perfumes")
    .update({ [campo]: valorValido.valor }, { count: "exact" })
    .eq("id", idValido.valor)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "El perfume ya no existe." };
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

async function actualizarActivoEnBloque(idsInput: unknown, activo: boolean): Promise<ActionResult> {
  await requerirAdmin();
  const idsValidados = validarIdsMasivos(idsInput);
  if (!idsValidados.ok) return { ok: false, error: idsValidados.error };
  const ids = idsValidados.valor;
  if (ids.length === 0) return { ok: true };

  const supabase = supabaseAdmin();
  const lotes = dividirEnLotes(ids);

  // Verificar toda la selección antes de tocar la primera fila. Esto evita que
  // una lista obsoleta produzca silenciosamente un resultado incompleto.
  for (const lote of lotes) {
    const { data, error } = await supabase.from("perfumes").select("id").in("id", lote);
    if (error) return { ok: false, error: error.message };
    if ((data?.length ?? 0) !== lote.length) {
      return { ok: false, error: "La selección contiene perfumes que ya no existen. Recargá el panel." };
    }
  }

  let actualizados = 0;
  for (const lote of lotes) {
    const { count, error } = await supabase
      .from("perfumes")
      .update({ activo }, { count: "exact" })
      .in("id", lote);
    if (error || count !== lote.length) {
      return {
        ok: false,
        partial: actualizados > 0 || (count ?? 0) > 0,
        error: error?.message ??
          `Supabase confirmó ${count ?? 0} de ${lote.length} cambios en el último lote. Recargá el panel.`,
      };
    }
    actualizados += count;
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** Oculta en bloque (útil para los perfumes de prueba/demo del sistema). */
export async function ocultarTodosAction(ids: string[]): Promise<ActionResult> {
  return actualizarActivoEnBloque(ids, false);
}

/** Muestra en bloque (para restaurar perfumes de prueba si se necesita). */
export async function mostrarTodosAction(ids: string[]): Promise<ActionResult> {
  return actualizarActivoEnBloque(ids, true);
}

/** Resetea los clicks_mensuales de todos los perfumes (inicio de mes). */
export async function resetearClicksAction(): Promise<ActionResult> {
  await requerirAdmin();
  const supabase = supabaseAdmin();
  const { count, error } = await supabase
    .from("perfumes")
    .update({ clicks_mensuales: 0 }, { count: "exact" })
    .gt("clicks_mensuales", 0);
  if (error) return { ok: false, error: error.message };
  if (count == null) return { ok: false, error: "Supabase no confirmó el reinicio de clics." };
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  Cupones
// ────────────────────────────────────────────────────────────────────────────

interface CuponNormalizado {
  id?: string;
  codigo: string;
  porcentaje_descuento: number;
  activo: boolean;
  limite_usos: number;
  fecha_expiracion: string | null;
}

function validarCuponInput(input: unknown): Validacion<CuponNormalizado> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorValidacion("Los datos del cupón son inválidos.");
  }
  const raw = input as Record<string, unknown>;
  const id = raw.id == null ? undefined : validarUuid(raw.id, "ID de cupón");
  if (id && !id.ok) return id;
  const codigoRaw = validarTexto(raw.codigo, "El código", 32);
  if (!codigoRaw.ok) return codigoRaw;
  const codigo = codigoRaw.valor.toUpperCase();
  // Debe coincidir con el formato que acepta el checkout.
  if (!/^[A-Z0-9-]{1,32}$/.test(codigo)) {
    return errorValidacion("El código solo puede contener letras, números y guiones.");
  }
  const porcentaje = validarEntero(raw.porcentaje_descuento, "El descuento", 1, 100);
  if (!porcentaje.ok) return porcentaje;
  const limite = validarEntero(raw.limite_usos, "El límite de usos", 1, 1_000_000);
  if (!limite.ok) return limite;
  const activo = validarBooleano(raw.activo, "Activo");
  if (!activo.ok) return activo;

  let fechaExpiracion: string | null = null;
  if (raw.fecha_expiracion != null && raw.fecha_expiracion !== "") {
    const fecha = validarTexto(raw.fecha_expiracion, "La fecha de expiración", 64);
    if (!fecha.ok) return fecha;
    const instante = new Date(fecha.valor);
    if (!Number.isFinite(instante.getTime())) {
      return errorValidacion("La fecha de expiración es inválida.");
    }
    fechaExpiracion = instante.toISOString();
  }

  return {
    ok: true,
    valor: {
      id: id?.valor,
      codigo,
      porcentaje_descuento: porcentaje.valor,
      activo: activo.valor,
      limite_usos: limite.valor,
      fecha_expiracion: fechaExpiracion,
    },
  };
}

export async function guardarCuponAction(input: CuponInput): Promise<ActionResult> {
  await requerirAdmin();
  const validacion = validarCuponInput(input);
  if (!validacion.ok) return { ok: false, error: validacion.error };
  const cupon = validacion.valor;
  const supabase = supabaseAdmin();
  const payload = {
    codigo: cupon.codigo,
    porcentaje_descuento: cupon.porcentaje_descuento,
    activo: cupon.activo,
    limite_usos: cupon.limite_usos,
    fecha_expiracion: cupon.fecha_expiracion,
  };

  if (cupon.id) {
    const { data: existente, error: errorLectura } = await supabase
      .from("cupones")
      .select("usos_actuales")
      .eq("id", cupon.id)
      .maybeSingle();
    if (errorLectura) return { ok: false, error: errorLectura.message };
    if (!existente) return { ok: false, error: "El cupón ya no existe." };
    const usosActuales = Number(existente.usos_actuales);
    if (!Number.isSafeInteger(usosActuales) || usosActuales < 0) {
      return { ok: false, error: "El contador de usos guardado es inválido." };
    }
    if (cupon.limite_usos < usosActuales) {
      return {
        ok: false,
        error: `El límite no puede ser menor a los ${usosActuales} usos ya consumidos.`,
      };
    }
    const { data: actualizado, error } = await supabase
      .from("cupones")
      .update(payload, { count: "exact" })
      .eq("id", cupon.id)
      .eq("usos_actuales", usosActuales)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!actualizado) {
      return { ok: false, error: "El cupón cambió mientras se editaba. Recargá el panel." };
    }
  } else {
    const { data: insertado, error } = await supabase
      .from("cupones")
      .insert(payload, { count: "exact" })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (!insertado) return { ok: false, error: "Supabase no confirmó la creación del cupón." };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleCuponAction(id: string, activo: boolean): Promise<ActionResult> {
  await requerirAdmin();
  const idValido = validarUuid(id, "ID de cupón");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const activoValido = validarBooleano(activo, "Activo");
  if (!activoValido.ok) return { ok: false, error: activoValido.error };
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("cupones")
    .update({ activo: activoValido.valor }, { count: "exact" })
    .eq("id", idValido.valor)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "El cupón ya no existe." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function eliminarCuponAction(id: string): Promise<ActionResult> {
  await requerirAdmin();
  const idValido = validarUuid(id, "ID de cupón");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("cupones")
    .delete({ count: "exact" })
    .eq("id", idValido.valor)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "El cupón ya no existe." };
  revalidatePath("/admin");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  Proveedor de stock externo (config_proveedores)
// ────────────────────────────────────────────────────────────────────────────

function validarProveedorInput(input: unknown): Validacion<{
  proveedor: string;
  api_url: string;
  api_key: string;
  apiKeyEnmascarada: boolean;
  sincronizar_diario: boolean;
}> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorValidacion("Los datos del proveedor son inválidos.");
  }
  const raw = input as Record<string, unknown>;
  const proveedor = validarTexto(raw.proveedor, "El proveedor", 160);
  if (!proveedor.ok) return proveedor;
  const apiUrlRaw = validarTexto(raw.api_url ?? "", "La URL de API", 2_048, { requerido: false });
  if (!apiUrlRaw.ok) return apiUrlRaw;
  const apiUrl = validarUrlHttp(apiUrlRaw.valor, "La URL de API");
  if (!apiUrl.ok) return apiUrl;
  const apiKey = validarTexto(raw.api_key ?? "", "La API Key", 8_192, { requerido: false });
  if (!apiKey.ok) return apiKey;
  const apiKeyEnmascarada = /^•{3,}$/.test(apiKey.valor);
  if (apiKey.valor.includes("•") && !apiKeyEnmascarada) {
    return errorValidacion("La API Key enmascarada es inválida.");
  }
  const sincronizar = validarBooleano(raw.sincronizar_diario, "Sincronizar diariamente");
  if (!sincronizar.ok) return sincronizar;
  return {
    ok: true,
    valor: {
      proveedor: proveedor.valor,
      api_url: apiUrl.valor,
      api_key: apiKey.valor,
      apiKeyEnmascarada,
      sincronizar_diario: sincronizar.valor,
    },
  };
}

/**
 * Guarda (upsert) la configuración del proveedor.
 * Si api_key llega como string enmascarado (•••), conserva el existente.
 */
export async function guardarProveedorAction(
  input: ConfigProveedorInput,
  idExistente?: string
): Promise<ActionResult> {
  await requerirAdmin();
  const validacion = validarProveedorInput(input);
  if (!validacion.ok) return { ok: false, error: validacion.error };
  const proveedor = validacion.valor;
  const idValido = idExistente == null
    ? undefined
    : validarUuid(idExistente, "ID de configuración");
  if (idValido && !idValido.ok) return { ok: false, error: idValido.error };
  const supabase = supabaseAdmin();

  const payload: Record<string, unknown> = {
    proveedor: proveedor.proveedor,
    api_url: proveedor.api_url || null,
    sincronizar_diario: proveedor.sincronizar_diario,
    updated_at: new Date().toISOString(),
  };

  // Solo pisar api_key si llega un valor real (no enmascarado)
  if (proveedor.api_key && !proveedor.apiKeyEnmascarada) {
    payload.api_key = proveedor.api_key;
  }

  if (idValido?.valor) {
    const { data, error } = await supabase
      .from("config_proveedores")
      .update(payload, { count: "exact" })
      .eq("id", idValido.valor)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[guardarProveedorAction]", error.message);
      return { ok: false, error: error.message };
    }
    if (!data) return { ok: false, error: "La configuración del proveedor ya no existe." };
  } else {
    const { data, error } = await supabase
      .from("config_proveedores")
      .insert(payload, { count: "exact" })
      .select("id")
      .single();
    if (error) {
      console.error("[guardarProveedorAction]", error.message);
      return { ok: false, error: error.message };
    }
    if (!data) return { ok: false, error: "Supabase no confirmó la configuración creada." };
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
  const idValido = validarUuid(id, "ID de configuración");
  if (!idValido.ok) return { ok: false, error: idValido.error };
  const supabase = supabaseAdmin();

  // Verificar que la config exista y tenga credenciales
  const { data, error } = await supabase
    .from("config_proveedores")
    .select("id,api_url,api_key")
    .eq("id", idValido.valor)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "No se encontró la configuración del proveedor." };
  }
  if (!data.api_url || !data.api_key) {
    return {
      ok: false,
      error: "Faltan credenciales (URL y/o API Key). Guardalas primero.",
    };
  }

  // Actualizamos la marca de último sync. La lectura real de Dropi se
  // implementará cuando se confirmen los endpoints del proveedor.
  const { data: actualizado, error: errUp } = await supabase
    .from("config_proveedores")
    .update({
      ultimo_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { count: "exact" })
    .eq("id", idValido.valor)
    .select("id")
    .maybeSingle();
  if (errUp) {
    console.error("[sincronizarProveedorAction]", errUp.message);
    return { ok: false, error: errUp.message };
  }
  if (!actualizado) return { ok: false, error: "La configuración del proveedor ya no existe." };

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
  // Las Server Actions son endpoints invocables: la página ya valida la sesión,
  // pero la acción también debe defenderse por sí sola.
  if (!(await sesionValida())) throw new Error("NO_AUTORIZADO");

  // Estado base si Supabase no está configurado
  if (!adminConfigurado()) {
    return { perfumes: [], cupones: [], configurado: false, top5: [], erroresCarga: [] };
  }

  const supabase = supabaseAdmin();
  const base = { configurado: true } as DatosAdmin;
  const erroresCarga: string[] = [];

  // 1) Perfumes (CRÍTICO: si falla, igual devolvemos el resto)
  // ⚠️ PostgREST corta en 1.000 filas por request SIN error → con ~1.800 en la
  // tienda hay que PAGINAR con .range() (el admin mostraba solo 1.000).
  let perfumes: Perfume[] = [];
  try {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("perfumes")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) {
        console.error("[cargarDatosAdmin] Error leyendo perfumes:", error.message);
        // Descartar lo ya paginado: mostrar 1.000 de 4.000 como si fueran todos
        // habilitaría decisiones y acciones masivas sobre un inventario incompleto.
        perfumes = [];
        erroresCarga.push(`Inventario: ${error.message}`);
        break;
      }
      perfumes.push(...((data ?? []) as unknown as Perfume[]));
      if (!data || data.length < 1000) break;
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo perfumes:", e);
    perfumes = [];
    erroresCarga.push(
      `Inventario: ${e instanceof Error ? e.message : "error desconocido"}`
    );
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
      erroresCarga.push(`Cupones: ${error.message}`);
    } else {
      cupones = (data ?? []) as unknown as Cupon[];
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo cupones:", e);
    erroresCarga.push(`Cupones: ${e instanceof Error ? e.message : "error desconocido"}`);
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
      erroresCarga.push(`Analítica: ${error.message}`);
    } else {
      top5 = (data ?? []) as { id: string; nombre: string; clicks_mensuales: number }[];
    }
  } catch (e) {
    console.error("[cargarDatosAdmin] Excepción leyendo top5:", e);
    erroresCarga.push(`Analítica: ${e instanceof Error ? e.message : "error desconocido"}`);
  }

  // Nunca serializamos config_proveedores al Client Component: puede contener
  // credenciales. Las acciones específicas la leen server-side cuando hace falta.
  return { ...base, perfumes, cupones, top5, erroresCarga };
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

  const { data, count, error } = await supabase
    .from("perfumes")
    // Nunca sobreescribir un producto real que casualmente comparta un SKU del
    // catálogo de muestra. Solo se insertan los demos que aún no existen.
    .upsert(payload, { onConflict: "sku", ignoreDuplicates: true, count: "exact" })
    .select("id");

  if (error) {
    console.error("[inicializarDemosAction]", error.message);
    return { ok: false, error: error.message };
  }
  if (count == null || count !== (data?.length ?? 0)) {
    return { ok: false, error: "Supabase no confirmó cuántos demos fueron creados." };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return {
    ok: true,
    cargados: count,
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

  const { data: demos, count: total, error: errorLectura } = await supabase
    .from("perfumes")
    .select("id", { count: "exact" })
    .eq("es_demo", true)
    .limit(MAX_DEMOS_A_BORRAR + 1);
  if (errorLectura) {
    console.error("[borrarTodosLosDemosAction]", errorLectura.message);
    return { ok: false, error: errorLectura.message };
  }
  if (total == null) return { ok: false, error: "Supabase no confirmó la cantidad de demos." };
  if (total > MAX_DEMOS_A_BORRAR) {
    return {
      ok: false,
      error: `Se encontraron ${total} demos; por seguridad esta acción admite hasta ${MAX_DEMOS_A_BORRAR}.`,
    };
  }
  const ids = (demos ?? []).map((demo) => String(demo.id));
  if (ids.length !== total) {
    return { ok: false, error: "No se pudo verificar la lista completa de demos." };
  }
  if (ids.length === 0) return { ok: true, borrados: 0 };

  const { count: borrados, error } = await supabase
    .from("perfumes")
    .delete({ count: "exact" })
    .eq("es_demo", true)
    .in("id", ids);

  if (error) {
    console.error("[borrarTodosLosDemosAction]", error.message);
    return { ok: false, error: error.message };
  }
  if (borrados !== ids.length) {
    return {
      ok: false,
      partial: (borrados ?? 0) > 0,
      error: `Supabase confirmó ${borrados ?? 0} de ${ids.length} eliminaciones. Recargá el panel.`,
    };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, borrados };
}
