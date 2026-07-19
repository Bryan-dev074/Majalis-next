import { NextRequest, NextResponse } from "next/server";
import { sesionValida } from "@/lib/supabase-admin";
import { buscarEnTodasLasTiendas } from "@/lib/scraper-tiendas";
import { cacheGet, cacheSet, claveCache, verificarRitmo } from "@/lib/asistente-cache";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";

/**
 * POST /api/asistente/tiendas
 * Body: { nombre: string }
 * Busca el producto en las 16 tiendas (Flujo B), puntúa con Gemini y devuelve
 * los datos para la tabla semáforo. Con caché temporal + control de ritmo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await sesionValida())) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const errorSolicitud = validarPostMismoOrigen(req);
  if (errorSolicitud) return NextResponse.json({ ok: false, error: errorSolicitud }, { status: 403 });
  const lectura = await leerJsonLimitado<{ nombre?: unknown }>(req, 2_048);
  if (!lectura.ok) return NextResponse.json({ ok: false, error: lectura.mensaje }, { status: lectura.status });
  const nombre = String(lectura.valor.nombre ?? "").trim();
  if (nombre.length < 3) {
    return NextResponse.json({ ok: false, error: "Nombre demasiado corto." }, { status: 400 });
  }
  if (nombre.length > 200) {
    return NextResponse.json({ ok: false, error: "Nombre demasiado largo." }, { status: 400 });
  }

  // 1) Caché (misma consulta → sin re-scrapear ni gastar créditos).
  const clave = claveCache("tiendas", nombre);
  const cacheado = cacheGet(clave);
  if (cacheado) return NextResponse.json({ ...(cacheado as object), cacheado: true });

  // 2) Control de ritmo.
  const ritmo = verificarRitmo(nombre);
  if (!ritmo.ok) {
    return NextResponse.json(
      { ok: false, codigo: "RITMO", esperaSegundos: ritmo.esperaSegundos, error: `Esperá ${ritmo.esperaSegundos} segundos antes de sincronizar otro producto.` },
      { status: 429 }
    );
  }

  try {
    const tiendas = await buscarEnTodasLasTiendas(nombre);
    const respuesta = { ok: true, tiendas };
    cacheSet(clave, respuesta);
    return NextResponse.json(respuesta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/asistente/tiendas]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
