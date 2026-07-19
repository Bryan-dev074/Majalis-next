import { NextRequest, NextResponse } from "next/server";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";
import { supabaseAdmin, adminConfigurado } from "@/lib/supabase-admin";

/**
 * POST /api/click
 * Suma +1 a clicks_mensuales del perfume cuyo id llega en el body.
 * Lo llama el modal de detalle del producto cuando un cliente lo abre.
 *
 * Funciona con la service role si está configurada; si no, no hace nada
 * (el sitio sigue andando, solo no se cuentan vistas).
 *
 * Body: { "id": "<uuid del perfume>" }
 */
export const dynamic = "force-dynamic";

const clicksRecientes = new Map<string, number>();
const VENTANA_CLICK_MS = 60_000;

export async function POST(req: NextRequest) {
  const errorSolicitud = validarPostMismoOrigen(req);
  if (errorSolicitud) return NextResponse.json({ ok: false }, { status: 403 });
  const lectura = await leerJsonLimitado<{ id?: unknown }>(req, 2_048);
  if (!lectura.ok) return NextResponse.json({ ok: false }, { status: lectura.status });
  if (!lectura.valor || typeof lectura.valor !== "object" || Array.isArray(lectura.valor)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const id = String(lectura.valor.id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const clave = `${ip}:${id}`;
  const ahora = Date.now();
  if (ahora - (clicksRecientes.get(clave) ?? 0) < VENTANA_CLICK_MS) {
    return NextResponse.json({ ok: true, repetido: true });
  }

  // Si no hay service role, respondemos ok sin tocar la base (modo graceful).
  if (!adminConfigurado()) {
    return NextResponse.json({ ok: true, modo: "local" });
  }

  try {
    const supabase = supabaseAdmin();
    // Una sola sentencia UPDATE en Postgres: dos aperturas simultáneas ya no
    // leen el mismo valor ni se pisan entre sí.
    const { data, error } = await supabase.rpc("incrementar_click_perfume", {
      p_id: id,
    });
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    if (data == null) return NextResponse.json({ ok: false }, { status: 404 });
    const nuevo = Number(data);
    if (clicksRecientes.size >= 10_000) clicksRecientes.clear();
    clicksRecientes.set(clave, ahora);
    return NextResponse.json({ ok: true, clicks: nuevo });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
