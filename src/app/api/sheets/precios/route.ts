import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sesionValida, adminConfigurado } from "@/lib/supabase-admin";
import { googleSheetsConfigurado } from "@/lib/google-sheets";
import { aplicarPreciosDesdeComparador } from "@/lib/sheets-pipeline";

/**
 * POST /api/sheets/precios
 * Toma el "Precio venta mín." de la tienda ganadora (pestaña Comparador) y lo
 * escribe como precio_regular del producto en Supabase. Lo dispara el botón
 * "Actualizar Precios" del panel (queda bloqueado hasta usar "Actualizar Moneda").
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
    const res = await aplicarPreciosDesdeComparador();
    // Una respuesta parcial es un fallo para el usuario, pero los precios que sí
    // llegaron a escribirse también deben invalidar el catálogo cacheado.
    if (res.aplicados > 0) {
      revalidatePath("/");
      revalidatePath("/admin");
    }
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/sheets/precios]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
