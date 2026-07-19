import type { sheets_v4 } from "googleapis";
import { getSheetsClient, GOOGLE_SHEET_ID } from "@/lib/google-sheets";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Motor de "Actualizar Moneda" y "Actualizar Precios" para el panel.
 *  · actualizarMonedaYComparador(): refresca el dólar (pestaña Cotizaciones) y
 *    recalcula el comparador de tiendas (pestaña Comparador).
 *  · aplicarPreciosDesdeComparador(): toma el "Precio venta mín." de la tienda
 *    ganadora y lo escribe como precio_regular del producto en Supabase.
 *
 * Es el mismo flujo que el Apps Script, pero del lado del servidor para poder
 * dispararlo con un botón (y aplicar precios a la base, que Apps Script no toca).
 */

const PRODUCTOS_HOJA = "Hoja 1";
const COTIZ_HOJA = "Cotizaciones";
const COMPARADOR_HOJA = "Comparador";
const API_DOLAR = "https://dolar.melizeche.com/api/1.0/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Casas de cambio populares [clave API, nombre]
const CASAS: [string, string][] = [
  ["cambioschaco", "Cambios Chaco"],
  ["maxicambios", "Maxicambios"],
  ["lamoneda", "Cambios La Moneda"],
  ["familiar", "Cambios Familiar"],
  ["mundialcambios", "Mundial Cambios"],
  ["bcp", "BCP (oficial)"],
];

// Parámetros de negocio (confirmados)
const ENVIO = 30000, AYUDANTE = 20000, GANANCIA = 40000, IVA_PCT = 0.1;

function aNumero(txt: string): number | null {
  const n = parseFloat(String(txt).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers de hojas
// ────────────────────────────────────────────────────────────────────────────

async function asegurarHoja(sheets: sheets_v4.Sheets, titulo: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
  const existe = (meta.data.sheets ?? []).some((s) => s.properties?.title === titulo);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: titulo } } }] },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Dólar → pestaña Cotizaciones
// ────────────────────────────────────────────────────────────────────────────

interface Dolar {
  valor: number;
  filas: (string | number)[][]; // [nombre, compra, venta]
  updated: string;
}

async function obtenerDolar(): Promise<Dolar | null> {
  try {
    const resp = await fetch(API_DOLAR, { headers: { "User-Agent": UA } });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { dolarpy?: Record<string, { compra?: number; venta?: number }>; updated?: string };
    const dp = json.dolarpy ?? {};
    const filas: (string | number)[][] = [];
    const ventas: number[] = [];
    for (const [key, nombre] of CASAS) {
      const d = dp[key];
      if (d && d.venta) {
        filas.push([nombre, d.compra ?? "", d.venta]);
        ventas.push(Number(d.venta));
      }
    }
    if (!ventas.length) return null;
    const valor = Math.round(ventas.reduce((a, b) => a + b, 0) / ventas.length);
    return { valor, filas, updated: json.updated ?? "" };
  } catch {
    return null;
  }
}

async function escribirCotizaciones(sheets: sheets_v4.Sheets, dolar: Dolar): Promise<void> {
  await asegurarHoja(sheets, COTIZ_HOJA);
  await sheets.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEET_ID, range: COTIZ_HOJA });
  const bloque: (string | number)[][] = [
    ["Dólar Venta (Gs)"],
    [dolar.valor],
    [],
    ["Casa de Cambio", "Compra", "Venta"],
    ...dolar.filas,
    [],
    ["Última actualización:", new Date().toISOString()],
    ["Dato de la fuente:", dolar.updated || "—"],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${COTIZ_HOJA}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: bloque },
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Comparador de tiendas → pestaña Comparador
// ────────────────────────────────────────────────────────────────────────────

interface Precios { gs: number | null; usd: number | null; }
interface Tienda { tienda: string; url: string; codigo: string; }

function extraerPrecios(html: string, tienda: string): Precios {
  const t = (tienda || "").toLowerCase();
  if (t.includes("pionner")) {
    const i = html.indexOf("price-product");
    const blk = i >= 0 ? html.substring(i, i + 2600) : html;
    const usd = blk.match(/U\$\s*([\d.,]+)/)?.[1];
    const gs = blk.match(/G\$\s*([\d.,]+)/)?.[1];
    return { usd: usd ? aNumero(usd) : null, gs: gs ? aNumero(gs) : null };
  }
  // Respaldo genérico: primer U$ / G$ que aparezca.
  const usd = html.match(/U\$\s*([\d.,]+)/)?.[1];
  const gs = html.match(/G\$\s*([\d.,]+)/)?.[1];
  return { usd: usd ? aNumero(usd) : null, gs: gs ? aNumero(gs) : null };
}

async function buscarPorCodigo(tienda: string, codigo: string): Promise<string | null> {
  const t = (tienda || "").toLowerCase();
  if (t.includes("pionner")) {
    try {
      const html = await (
        await fetch(`https://www.pionnershop.com/index.php?route=product/search&search=${encodeURIComponent(codigo)}`, {
          headers: { "User-Agent": UA },
        })
      ).text();
      return html.match(/href="(https:\/\/www\.pionnershop\.com\/[a-z0-9][a-z0-9-]{8,}[A-Za-z]{1,3})"/i)?.[1] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchTexto(url: string): Promise<string | null> {
  try {
    return await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  } catch {
    return null;
  }
}

async function scrapearTienda(t: Tienda): Promise<Precios | null> {
  let html = t.url ? await fetchTexto(t.url) : null;
  let p = html ? extraerPrecios(html, t.tienda) : null;
  if (p && (p.gs || p.usd)) return p;
  if (t.codigo) {
    const url2 = await buscarPorCodigo(t.tienda, t.codigo);
    if (url2) {
      html = await fetchTexto(url2);
      p = html ? extraerPrecios(html, t.tienda) : null;
      if (p && (p.gs || p.usd)) return p;
    }
  }
  return null;
}

interface Calc {
  tienda: string; precioGs: number | null; precioUsd: number | null;
  dolarTienda: number | string; gananciaCambiaria: number | string;
  ivaMonto: number; costoTotal: number; precioVentaMin: number; tuGanancia: number;
}

function calcular(t: Tienda, p: Precios, dolarMercado: number): Calc | null {
  const dolarTienda = p.gs && p.usd ? Math.round(p.gs / p.usd) : "";
  const costoEnDolar = p.usd ? Math.round(p.usd * dolarMercado) : null;
  const costoCompra = costoEnDolar != null ? costoEnDolar : p.gs;
  if (!costoCompra) return null;
  const gananciaCambiaria = p.gs && costoEnDolar != null ? p.gs - costoEnDolar : "";
  const ivaMonto = Math.round(costoCompra * IVA_PCT);
  const costoTotal = costoCompra + ivaMonto;
  const precioVentaMin = Math.ceil((costoTotal + ENVIO + AYUDANTE + GANANCIA) / 1000) * 1000;
  const tuGanancia = precioVentaMin - costoTotal - ENVIO - AYUDANTE;
  return {
    tienda: t.tienda, precioGs: p.gs, precioUsd: p.usd, dolarTienda, gananciaCambiaria,
    ivaMonto, costoTotal, precioVentaMin, tuGanancia,
  };
}

const COMP_ENCABEZADO = [
  "Producto", "Tienda", "Precio Gs", "Precio USD", "Dólar tienda", "Ganancia cambio",
  "IVA 10%", "Costo total", "Precio venta mín.", "Tu ganancia", "¿Comprar acá?", "ID",
];

async function construirComparador(
  sheets: sheets_v4.Sheets,
  dolarMercado: number
): Promise<{ filas: (string | number)[][]; productos: number; tiendas: number }> {
  const datos =
    (await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `'${PRODUCTOS_HOJA}'!A:J` })).data
      .values ?? [];

  const filas: (string | number)[][] = [];
  let productos = 0, tiendasOk = 0;

  for (let r = 1; r < datos.length; r++) {
    const id = datos[r][0], nombre = datos[r][2], tiendasRaw = datos[r][9];
    if (!id || !tiendasRaw) continue;
    let tiendas: Tienda[] = [];
    try { tiendas = JSON.parse(String(tiendasRaw)); } catch { continue; }
    if (!tiendas.length) continue;
    productos++;

    const calcs: Calc[] = [];
    for (const t of tiendas) {
      const p = await scrapearTienda(t);
      if (!p) continue;
      const c = calcular(t, p, dolarMercado);
      if (c) { calcs.push(c); tiendasOk++; }
    }
    if (!calcs.length) {
      filas.push([String(nombre), "(no se pudo leer precio)", "", "", "", "", "", "", "", "", "", String(id)]);
      continue;
    }
    let win = calcs[0];
    for (const c of calcs) if (c.costoTotal < win.costoTotal) win = c;
    for (const c of calcs) {
      filas.push([
        String(nombre), c.tienda, c.precioGs ?? "", c.precioUsd ?? "", c.dolarTienda, c.gananciaCambiaria,
        c.ivaMonto, c.costoTotal, c.precioVentaMin, c.tuGanancia, c === win ? "✅ COMPRAR ACÁ" : "", String(id),
      ]);
    }
  }
  return { filas, productos, tiendas: tiendasOk };
}

async function escribirComparador(sheets: sheets_v4.Sheets, filas: (string | number)[][], dolarMercado: number): Promise<void> {
  await asegurarHoja(sheets, COMPARADOR_HOJA);
  await sheets.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEET_ID, range: COMPARADOR_HOJA });
  const bloque = [COMP_ENCABEZADO, ...filas, [], [`Actualizado: ${new Date().toISOString()} · Dólar mercado: ${dolarMercado}`]];
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${COMPARADOR_HOJA}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: bloque },
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  Entradas públicas
// ────────────────────────────────────────────────────────────────────────────

/** Refresca dólar + comparador. */
export async function actualizarMonedaYComparador(): Promise<{
  ok: boolean; dolar?: number; productos?: number; tiendas?: number; error?: string;
}> {
  const dolar = await obtenerDolar();
  if (!dolar) return { ok: false, error: "No se pudo obtener la cotización del dólar." };

  const sheets = await getSheetsClient();
  await escribirCotizaciones(sheets, dolar);
  const { filas, productos, tiendas } = await construirComparador(sheets, dolar.valor);
  await escribirComparador(sheets, filas, dolar.valor);
  return { ok: true, dolar: dolar.valor, productos, tiendas };
}

/** Aplica el "Precio venta mín." de la tienda ganadora como precio_regular en Supabase. */
export async function aplicarPreciosDesdeComparador(): Promise<{
  ok: boolean;
  aplicados: number;
  candidatos?: number;
  fallidos?: number;
  errores?: string[];
  error?: string;
}> {
  const sheets = await getSheetsClient();
  const datos =
    (await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `'${COMPARADOR_HOJA}'!A2:L` })).data
      .values ?? [];
  if (!datos.length) {
    return {
      ok: false,
      aplicados: 0,
      error: "El comparador está vacío. Actualizá la moneda primero.",
    };
  }

  // Validar todo antes de tocar Supabase. De esta forma una fila incompleta no
  // deja una tanda aplicada a medias por un problema que ya estaba en la Sheet.
  const ganadores = new Map<string, number>();
  const erroresEntrada: string[] = [];
  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    const comprar = String(fila[10] ?? "");
    if (!comprar.includes("COMPRAR")) continue;

    const id = String(fila[11] ?? "").trim();
    const precio = typeof fila[8] === "number" ? fila[8] : aNumero(String(fila[8] ?? ""));
    if (!id) {
      erroresEntrada.push(`Fila ${i + 2}: la opción ganadora no tiene ID.`);
      continue;
    }
    if (precio == null || !Number.isFinite(precio) || precio <= 0) {
      erroresEntrada.push(`Fila ${i + 2}: el precio ganador de ${id} no es válido.`);
      continue;
    }
    const anterior = ganadores.get(id);
    if (anterior != null && anterior !== precio) {
      erroresEntrada.push(`El producto ${id} tiene más de un precio ganador distinto.`);
      continue;
    }
    ganadores.set(id, precio);
  }

  if (erroresEntrada.length > 0) {
    return {
      ok: false,
      aplicados: 0,
      candidatos: ganadores.size,
      fallidos: erroresEntrada.length,
      errores: erroresEntrada,
      error: `No se aplicó ningún precio: hay ${erroresEntrada.length} fila(s) inválida(s) en el comparador. ${erroresEntrada[0]}`,
    };
  }
  if (ganadores.size === 0) {
    return {
      ok: false,
      aplicados: 0,
      candidatos: 0,
      error: "El comparador no tiene ninguna tienda ganadora para aplicar.",
    };
  }

  const supabase = supabaseAdmin();
  let aplicados = 0;
  const errores: string[] = [];
  for (const [id, precio] of ganadores) {
    const { data, error } = await supabase
      .from("perfumes")
      .update({ precio_regular: precio })
      .eq("id", id)
      .select("id");
    if (error) {
      errores.push(`${id}: ${error.message}`);
      continue;
    }
    if (!data || data.length !== 1) {
      errores.push(`${id}: no se encontró una única fila para actualizar.`);
      continue;
    }
    aplicados++;
  }

  if (errores.length > 0) {
    return {
      ok: false,
      aplicados,
      candidatos: ganadores.size,
      fallidos: errores.length,
      errores,
      error: `Actualización parcial: ${aplicados} precio(s) aplicado(s) y ${errores.length} fallido(s). ${errores[0]}`,
    };
  }
  return { ok: true, aplicados, candidatos: ganadores.size, fallidos: 0 };
}
