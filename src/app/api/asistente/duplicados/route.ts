import { NextRequest, NextResponse } from "next/server";
import { sesionValida, adminConfigurado, supabaseAdmin } from "@/lib/supabase-admin";
import { similitud } from "@/lib/similitud";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";

/**
 * POST /api/asistente/duplicados
 * Body: { nombre: string }
 * Devuelve productos ya existentes con nombre igual o muy parecido, para alertar
 * al asistente ANTES de cargar (control de duplicados en tiempo real, onBlur).
 *
 * Respuesta: { ok, hayDuplicado, exacto, candidatos: [{id, nombre, marca, similitud}] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UMBRAL_ALERTA = 0.72; // a partir de acá se considera "muy similar"

export async function POST(req: NextRequest) {
  if (!(await sesionValida())) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!adminConfigurado()) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 500 });
  }
  const errorSolicitud = validarPostMismoOrigen(req);
  if (errorSolicitud) return NextResponse.json({ ok: false, error: errorSolicitud }, { status: 403 });

  const lectura = await leerJsonLimitado<{ nombre?: unknown }>(req, 2_048);
  if (!lectura.ok) return NextResponse.json({ ok: false, error: lectura.mensaje }, { status: lectura.status });
  const nombre = String(lectura.valor.nombre ?? "").trim();
  if (nombre.length < 3) {
    return NextResponse.json({ ok: true, hayDuplicado: false, exacto: false, candidatos: [] });
  }
  if (nombre.length > 200) {
    return NextResponse.json({ ok: false, error: "Nombre demasiado largo." }, { status: 400 });
  }

  try {
    const supabase = supabaseAdmin();
    const perfumes: Array<{ id: string; nombre: string; marca: string }> = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("perfumes")
        .select("id, nombre, marca")
        .order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!Array.isArray(data)) {
        return NextResponse.json({ ok: false, error: "Supabase devolvió una respuesta inválida." }, { status: 500 });
      }
      perfumes.push(...data.map((fila) => ({
        id: String(fila.id),
        nombre: String(fila.nombre ?? ""),
        marca: String(fila.marca ?? ""),
      })));
      if (data.length < 1000) break;
    }

    const candidatos = perfumes
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        marca: p.marca,
        similitud: Number(similitud(nombre, p.nombre).toFixed(3)),
      }))
      .filter((c) => c.similitud >= UMBRAL_ALERTA)
      .sort((a, b) => b.similitud - a.similitud)
      .slice(0, 5);

    const exacto = candidatos.some((c) => c.similitud >= 0.97);
    return NextResponse.json({
      ok: true,
      hayDuplicado: candidatos.length > 0,
      exacto,
      candidatos,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/asistente/duplicados]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
