import { NextResponse } from "next/server";

import { buscarCuponVigente } from "@/lib/cupones-server";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const errorSolicitud = validarPostMismoOrigen(request);
    if (errorSolicitud) {
      return NextResponse.json({ ok: false, mensaje: errorSolicitud }, { status: 403 });
    }
    const lectura = await leerJsonLimitado<{ codigo?: unknown }>(request, 2_048);
    if (!lectura.ok) {
      return NextResponse.json({ ok: false, mensaje: lectura.mensaje }, { status: lectura.status });
    }
    const body = lectura.valor;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, mensaje: "La solicitud no contiene un código válido." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const resultado = await buscarCuponVigente(supabaseAdmin(), body.codigo);
    const cuponPublico = resultado.cupon
      ? {
          codigo: resultado.cupon.codigo,
          porcentaje_descuento: resultado.cupon.porcentaje_descuento,
        }
      : null;
    return NextResponse.json(
      {
        ok: resultado.status === 200,
        cupon: cuponPublico,
        mensaje: resultado.mensaje,
        motivoStatus: resultado.status,
      },
      // Un código inexistente/inactivo es una respuesta de validación normal,
      // no un fallo del recurso HTTP. Así tampoco ensucia la consola del
      // comprador con un 404 esperado cada vez que se equivoca al escribirlo.
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/cupon]", error);
    return NextResponse.json(
      { ok: false, mensaje: "No pudimos validar el código ahora. Intentá de nuevo." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
