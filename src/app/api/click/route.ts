import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  let id: string;
  try {
    const body = await req.json();
    id = String(body.id ?? "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  // Si no hay service role, respondemos ok sin tocar la base (modo graceful).
  if (!adminConfigurado()) {
    return NextResponse.json({ ok: true, modo: "local" });
  }

  try {
    const supabase = supabaseAdmin();
    // Lectura-escritura atómica vía RPC-free: leemos y actualizamos.
    const { data, error: errRead } = await supabase
      .from("perfumes")
      .select("clicks_mensuales")
      .eq("id", id)
      .single();

    if (errRead || !data) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const nuevo = Number(data.clicks_mensuales ?? 0) + 1;
    const { error } = await supabase
      .from("perfumes")
      .update({ clicks_mensuales: nuevo })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    return NextResponse.json({ ok: true, clicks: nuevo });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
