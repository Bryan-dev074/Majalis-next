import { NextRequest, NextResponse } from "next/server";
import { sesionValida } from "@/lib/supabase-admin";
import { cacheGet, cacheSet, claveCache, verificarRitmo, fetchConReintento } from "@/lib/asistente-cache";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";

/**
 * POST /api/asistente/perfume
 * Body: { nombre: string }
 * Gemini Flash como experto en perfumería → JSON estructurado para el formulario.
 *
 * Robustez:
 *  · es_perfume/motivo_error → la IA avisa si NO es un perfume (no alucina).
 *  · ml siempre número puro (deduce 100 si no se indica).
 *  · caché temporal por nombre (no re-consume créditos en repeticiones).
 *  · control de ritmo (frena ráfagas) + reintento ante 429/503.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    es_perfume: { type: "BOOLEAN", description: "true si el nombre corresponde a un perfume real/reconocible" },
    motivo_error: { type: "STRING", description: "si es_perfume=false, explicación breve (ej: no es un perfume, nombre ilegible)" },
    marca: { type: "STRING", description: "Marca/casa real, ej: Lattafa, Afnan, Rasasi" },
    ml: { type: "INTEGER", description: "Volumen en ml como número puro; si no se indica, la presentación más común" },
    categorias: { type: "ARRAY", items: { type: "STRING" } },
    descripcion: { type: "STRING", description: "Atractiva para vender, 2-3 oraciones cortas, en español" },
    notas_salida: { type: "ARRAY", items: { type: "STRING" } },
    notas_corazon: { type: "ARRAY", items: { type: "STRING" } },
    notas_fondo: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["es_perfume", "marca", "ml", "categorias", "descripcion", "notas_salida", "notas_corazon", "notas_fondo"],
};

export async function POST(req: NextRequest) {
  if (!(await sesionValida())) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const errorSolicitud = validarPostMismoOrigen(req);
  if (errorSolicitud) return NextResponse.json({ ok: false, error: errorSolicitud }, { status: 403 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Falta GEMINI_API_KEY en el servidor." }, { status: 500 });
  }

  const lectura = await leerJsonLimitado<{ nombre?: unknown }>(req, 2_048);
  if (!lectura.ok) return NextResponse.json({ ok: false, error: lectura.mensaje }, { status: lectura.status });
  const nombre = String(lectura.valor.nombre ?? "").trim();
  if (nombre.length < 3) {
    return NextResponse.json({ ok: false, error: "Nombre demasiado corto." }, { status: 400 });
  }
  if (nombre.length > 200) {
    return NextResponse.json({ ok: false, error: "Nombre demasiado largo." }, { status: 400 });
  }

  // 1) Caché (misma consulta → sin gastar créditos).
  const clave = claveCache("perfume", nombre);
  const cacheado = cacheGet(clave);
  if (cacheado) return NextResponse.json({ ...(cacheado as object), cacheado: true });

  // 2) Control de ritmo (evita ráfagas que bloquean el plan gratuito).
  const ritmo = verificarRitmo(nombre);
  if (!ritmo.ok) {
    return NextResponse.json(
      { ok: false, codigo: "RITMO", esperaSegundos: ritmo.esperaSegundos, error: `Esperá ${ritmo.esperaSegundos} segundos antes de sincronizar otro producto.` },
      { status: 429 }
    );
  }

  const prompt =
    `Sos un experto en perfumería árabe y de nicho. A partir del nombre, devolvé los datos reales.\n` +
    `Nombre ingresado: "${nombre}".\n\n` +
    `IMPORTANTE — validá primero:\n` +
    `- Si NO es un perfume (es otra cosa, está muy mal escrito, es un código sin sentido o no lo podés reconocer), ` +
    `devolvé es_perfume=false y motivo_error con una explicación breve. NO inventes marca ni notas en ese caso.\n` +
    `- Si SÍ es un perfume, devolvé es_perfume=true y completá:\n` +
    `  · marca: la casa/marca real (ej: Lattafa, Afnan, Maison Alhambra).\n` +
    `  · ml: número entero (extraelo del nombre; si no está, la presentación más común, normalmente 100).\n` +
    `  · categorias: 2 a 4 familias olfativas (ej: Oud, Dulce, Oriental, Amaderado).\n` +
    `  · descripcion: atractiva para vender, 2-3 oraciones cortas, en español.\n` +
    `  · notas_salida / notas_corazon / notas_fondo: las notas reales de la pirámide.\n` +
    `Respondé SOLO el JSON del schema.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`;
    const resp = await fetchConReintento(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.3 },
      }),
    });

    if (resp.status === 429) {
      return NextResponse.json(
        { ok: false, codigo: "SATURADO", esperaSegundos: 10, error: "Gemini está saturado (límite por minuto). Esperá unos segundos y reintentá." },
        { status: 429 }
      );
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[api/asistente/perfume] Gemini", resp.status, txt.slice(0, 300));
      return NextResponse.json({ ok: false, error: `Gemini respondió ${resp.status}.` }, { status: 502 });
    }

    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      return NextResponse.json({ ok: false, error: "Gemini no devolvió contenido." }, { status: 502 });
    }
    const d = JSON.parse(texto);

    // La IA detectó que NO es un perfume → error claro, sin inventar.
    if (d.es_perfume === false) {
      return NextResponse.json({ ok: false, codigo: "NO_PERFUME", error: d.motivo_error || "El nombre no parece un perfume. Revisá el texto." }, { status: 422 });
    }

    // Limpieza de ml: número puro, default 100.
    const ml = Math.round(Number(d.ml)) || 100;

    const respuesta = {
      ok: true,
      perfume: {
        marca: String(d.marca ?? "").trim(),
        volumen_ml: ml > 0 && ml < 2000 ? ml : 100,
        categoria: Array.isArray(d.categorias) ? d.categorias : [],
        descripcion: String(d.descripcion ?? "").trim(),
        notas_olfativas: {
          salida: Array.isArray(d.notas_salida) ? d.notas_salida : [],
          corazon: Array.isArray(d.notas_corazon) ? d.notas_corazon : [],
          fondo: Array.isArray(d.notas_fondo) ? d.notas_fondo : [],
        },
      },
    };
    cacheSet(clave, respuesta);
    return NextResponse.json(respuesta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("[api/asistente/perfume]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
