import { NextResponse } from "next/server";
import { supabaseAdmin, adminConfigurado, sesionValida } from "@/lib/supabase-admin";
import {
  getSheetsClient,
  googleSheetsConfigurado,
  GOOGLE_SHEET_ID,
} from "@/lib/google-sheets";

/**
 * POST /api/sheets/sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza SOLO los productos NUEVOS de STOCK LOCAL desde Supabase hacia la
 * Google Sheet, para que la planilla esté completa antes del scraping de precios.
 * (Excluye Origen Externo / Dropi y los perfumes de prueba/demo.)
 *
 * ⚠️ Es de un solo sentido (Supabase → Sheet) y NO toca precios:
 *    el flujo de precios funciona al revés (Sheet → Página) y vive en E,F,G.
 *
 * Mapeo de columnas en la planilla (la fila 1 es el encabezado):
 *    A: ID           ← perfumes.id (uuid)
 *    B: Código       ← perfumes.sku
 *    C: Nombre       ← perfumes.nombre
 *    D: Marca        ← perfumes.marca
 *    E,F,G:          ← vacías (costo / margen / cotización → scraping o manual)
 *    H: Precio Venta ← fórmula  =REDONDEAR(((E*(1+F))*G); -3)
 *    I: Ganancia     ← fórmula  =H - (E*G)
 */

export const runtime = "nodejs"; // googleapis necesita el runtime de Node, no Edge
export const dynamic = "force-dynamic";

// Primera hoja de la planilla (rangos sin nombre de hoja apuntan a la 1ª visible).
const RANGO_IDS = "A:A"; // columna de IDs ya cargados
const RANGO_APPEND = "A1"; // ancla para que el append detecte la tabla

// Fórmulas dinámicas mapeadas al número de fila real donde se inserta cada producto.
const formulaPrecioVenta = (fila: number) =>
  `=REDONDEAR(((E${fila} * (1 + F${fila})) * G${fila}); -3)`;
const formulaGanancia = (fila: number) =>
  `=H${fila} - (E${fila} * G${fila})`;

export async function POST() {
  // 1) Seguridad: requiere sesión de admin (cookie firmada del panel) + Supabase.
  if (!(await sesionValida())) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!adminConfigurado()) {
    return NextResponse.json(
      { ok: false, error: "Supabase no está configurado en el servidor." },
      { status: 500 }
    );
  }
  if (!googleSheetsConfigurado()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Faltan las credenciales de Google (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).",
      },
      { status: 500 }
    );
  }

  try {
    const sheets = await getSheetsClient();

    // 2) Leer los IDs que YA existen en la planilla (Columna A).
    //    values.get recorta las filas vacías del final, así que la cantidad de
    //    filas devueltas == última fila ocupada → la próxima libre es +1.
    //    (Asume que toda fila de datos tiene su ID en la columna A, sin huecos.)
    const lectura = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: RANGO_IDS,
    });
    const filasA = lectura.data.values ?? []; // [["ID"], ["uuid-1"], ["uuid-2"], ...]
    const idsExistentes = new Set(
      filasA.map((fila) => String(fila?.[0] ?? "").trim()).filter(Boolean)
    );
    const proximaFila = filasA.length + 1;

    // 3) Traer SOLO el stock local de Supabase (datos básicos para el scraping).
    //    Espejo exacto del filtro "Mi Stock Local" del panel:
    //    no externos (es_dropi / sku "DROPI-…") y no demos (es_demo).
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("perfumes")
      .select("id, sku, nombre, marca")
      .eq("es_dropi", false) // excluye Origen Externo / Dropi
      .eq("es_demo", false) // excluye perfumes de prueba
      .order("created_at", { ascending: true });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    // Descarte extra del prefijo "DROPI-" para igualar 1:1 a esExterno() del panel.
    const productos = (data ?? []).filter(
      (p) => !(p.sku != null && p.sku.startsWith("DROPI-"))
    );

    // 4) Quedarnos SOLO con los productos cuyo ID todavía no está en la planilla.
    const nuevos = productos.filter(
      (p) => !idsExistentes.has(String(p.id).trim())
    );

    if (nuevos.length === 0) {
      return NextResponse.json({
        ok: true,
        nuevos: 0,
        totalSupabase: productos.length,
        yaEnPlanilla: idsExistentes.size,
        detalle: "La planilla ya está al día. No hay productos nuevos para agregar.",
      });
    }

    // 5) Construir cada fila A:I con sus fórmulas apuntando a la fila real.
    const filas = nuevos.map((p, i) => {
      const fila = proximaFila + i;
      return [
        p.id, // A · ID
        p.sku ?? "", // B · Código
        p.nombre ?? "", // C · Nombre
        p.marca ?? "", // D · Marca
        "", // E · Costo (scraping / manual)
        "", // F · Margen
        "", // G · Cotización
        formulaPrecioVenta(fila), // H · Precio Venta
        formulaGanancia(fila), // I · Ganancia
      ];
    });

    // 6) Append en una sola llamada (eficiente). USER_ENTERED interpreta las
    //    fórmulas y los números tal como si se escribieran a mano en la celda.
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: RANGO_APPEND,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: filas },
    });

    return NextResponse.json({
      ok: true,
      nuevos: nuevos.length,
      totalSupabase: productos.length,
      yaEnPlanilla: idsExistentes.size,
      rango: res.data.updates?.updatedRange ?? null,
      detalle: `${nuevos.length} producto(s) nuevo(s) agregados a la planilla.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/sheets/sync]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
