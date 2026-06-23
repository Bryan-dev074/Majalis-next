import { NextResponse } from "next/server";
import { supabaseAdmin, adminConfigurado, sesionValida } from "@/lib/supabase-admin";
import {
  getSheetsClient,
  googleSheetsConfigurado,
  GOOGLE_SHEET_ID,
} from "@/lib/google-sheets";
import type { sheets_v4 } from "googleapis";

/**
 * /api/sheets/sync  ·  Sincronización Supabase → Google Sheet (un solo sentido)
 * ─────────────────────────────────────────────────────────────────────────────
 *  GET  → VERIFICAR (solo lectura): compara el stock local contra la planilla y
 *         reporta faltantes / desactualizados. No escribe nada.
 *  POST → SINCRONIZAR: agrega los productos nuevos (append) y corrige los que
 *         tengan datos distintos (update B:D). Nunca toca precios (E,F,G,H,I).
 *
 *  "Stock local" = espejo del filtro del panel: es_dropi=false, es_demo=false,
 *  sku sin prefijo "DROPI-".
 *
 *  Columnas: A=ID · B=Código(sku) · C=Nombre · D=Marca · E,F,G=scraping ·
 *            H=Precio Venta (fórmula) · I=Ganancia (fórmula).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGO_DATOS = "A:D"; // id, código, nombre, marca de la planilla
const RANGO_APPEND = "A1"; // ancla para el append

const formulaPrecioVenta = (fila: number) =>
  `=REDONDEAR(((E${fila} * (1 + F${fila})) * G${fila}); -3)`;
const formulaGanancia = (fila: number) =>
  `=H${fila} - (E${fila} * G${fila})`;

interface ProductoLocal {
  id: string;
  sku: string | null;
  nombre: string;
  marca: string;
}
interface Analisis {
  sheets: sheets_v4.Sheets;
  totalLocal: number;
  proximaFila: number;
  faltantes: ProductoLocal[]; // no están en la planilla
  desactualizados: (ProductoLocal & { fila: number })[]; // están, con datos distintos
}

const norm = (v: unknown) => String(v ?? "").trim();

/** Lee la planilla + Supabase y calcula faltantes y desactualizados. */
async function analizar(): Promise<Analisis> {
  const sheets = await getSheetsClient();

  // 1) Planilla: id → { fila, código, nombre, marca }
  const lectura = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: RANGO_DATOS,
  });
  const filas = lectura.data.values ?? [];
  const enSheet = new Map<string, { fila: number; codigo: string; nombre: string; marca: string }>();
  filas.forEach((f, i) => {
    const id = norm(f?.[0]);
    if (id) enSheet.set(id, { fila: i + 1, codigo: norm(f?.[1]), nombre: norm(f?.[2]), marca: norm(f?.[3]) });
  });
  const proximaFila = filas.length + 1;

  // 2) Supabase: solo stock local
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("perfumes")
    .select("id, sku, nombre, marca")
    .eq("es_dropi", false)
    .eq("es_demo", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const productos = (data ?? []).filter(
    (p) => !((p.sku ?? "").startsWith("DROPI-"))
  ) as ProductoLocal[];

  // 3) Clasificar
  const faltantes: ProductoLocal[] = [];
  const desactualizados: (ProductoLocal & { fila: number })[] = [];
  for (const p of productos) {
    const enP = enSheet.get(norm(p.id));
    if (!enP) {
      faltantes.push(p);
      continue;
    }
    const distinto =
      enP.codigo !== norm(p.sku) ||
      enP.nombre !== norm(p.nombre) ||
      enP.marca !== norm(p.marca);
    if (distinto) desactualizados.push({ ...p, fila: enP.fila });
  }

  return { sheets, totalLocal: productos.length, proximaFila, faltantes, desactualizados };
}

/** Guards comunes de auth/config. Devuelve un NextResponse si algo falla, o null. */
async function verificarAcceso(): Promise<NextResponse | null> {
  if (!(await sesionValida()))
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!adminConfigurado())
    return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 500 });
  if (!googleSheetsConfigurado())
    return NextResponse.json(
      { ok: false, error: "Faltan credenciales de Google (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)." },
      { status: 500 }
    );
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET → VERIFICAR (solo lectura)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const bloqueo = await verificarAcceso();
  if (bloqueo) return bloqueo;

  try {
    const { totalLocal, faltantes, desactualizados } = await analizar();
    const sincronizado = faltantes.length === 0 && desactualizados.length === 0;
    return NextResponse.json({
      ok: true,
      sincronizado,
      totalLocal,
      enPlanilla: totalLocal - faltantes.length,
      faltantes: faltantes.length,
      desactualizados: desactualizados.length,
      detalle: sincronizado
        ? "Todos los productos de stock local están bien cargados y actualizados."
        : `Pendiente: ${faltantes.length} sin enviar y ${desactualizados.length} con datos desactualizados.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/sheets/sync GET]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST → SINCRONIZAR (append faltantes + update desactualizados)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST() {
  const bloqueo = await verificarAcceso();
  if (bloqueo) return bloqueo;

  try {
    const { sheets, totalLocal, proximaFila, faltantes, desactualizados } = await analizar();

    // 1) Agregar los nuevos (append) con sus fórmulas en la fila correcta.
    let agregados = 0;
    if (faltantes.length > 0) {
      const filas = faltantes.map((p, i) => {
        const fila = proximaFila + i;
        return [
          p.id, p.sku ?? "", p.nombre ?? "", p.marca ?? "",
          "", "", "",
          formulaPrecioVenta(fila), formulaGanancia(fila),
        ];
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: RANGO_APPEND,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: filas },
      });
      agregados = filas.length;
    }

    // 2) Corregir los desactualizados: solo columnas B:D (no toca precios).
    //    RAW para que nombres/códigos nunca se interpreten como fórmula.
    let actualizados = 0;
    if (desactualizados.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: desactualizados.map((p) => ({
            range: `B${p.fila}:D${p.fila}`,
            values: [[p.sku ?? "", p.nombre ?? "", p.marca ?? ""]],
          })),
        },
      });
      actualizados = desactualizados.length;
    }

    return NextResponse.json({
      ok: true,
      sincronizado: true, // tras sincronizar, todo queda al día
      totalLocal,
      agregados,
      actualizados,
      detalle:
        agregados === 0 && actualizados === 0
          ? "La planilla ya estaba al día. Todos los productos están bien actualizados."
          : `${agregados} agregado(s) y ${actualizados} actualizado(s) en la planilla.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/sheets/sync POST]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
