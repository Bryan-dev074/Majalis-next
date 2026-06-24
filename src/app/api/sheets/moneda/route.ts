import { NextResponse } from "next/server";
import { sesionValida, adminConfigurado } from "@/lib/supabase-admin";
import { googleSheetsConfigurado } from "@/lib/google-sheets";
import { actualizarMonedaYComparador } from "@/lib/sheets-pipeline";

/**
 * POST /api/sheets/moneda
 * Refresca el dólar (pestaña Cotizaciones) y recalcula el comparador de tiendas
 * (pestaña Comparador). Lo dispara el botón "Actualizar Moneda" del panel.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!(await sesionValida())) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!adminConfigurado() || !googleSheetsConfigurado()) {
    return NextResponse.json({ ok: false, error: "Falta configuración de Supabase o Google." }, { status: 500 });
  }
  try {
    const res = await actualizarMonedaYComparador();
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/sheets/moneda]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
