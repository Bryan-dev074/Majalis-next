import "server-only";

/**
 * Los POST públicos que cambian estado aceptan exclusivamente JSON enviado
 * desde la propia tienda. Además de reducir abuso accidental, esto impide que
 * un formulario alojado en otro dominio pueda consumir cupones.
 */
export function validarPostMismoOrigen(request: Request): string | null {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return "La solicitud debe enviarse como JSON.";

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return "Origen de solicitud no permitido.";

  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return "Origen de solicitud no permitido.";
    }
  } catch {
    return "Origen de solicitud no válido.";
  }
  return null;
}

export type ResultadoJsonLimitado<T> =
  | { ok: true; valor: T }
  | { ok: false; status: 400 | 413; mensaje: string };

/**
 * `Content-Length` puede faltar (HTTP chunked), por lo que también se mide el
 * cuerpo real antes de parsearlo. Evita que un cliente directo eluda el límite
 * simplemente omitiendo la cabecera que sí envía el navegador normal.
 */
export async function leerJsonLimitado<T>(
  request: Request,
  maximoBytes: number
): Promise<ResultadoJsonLimitado<T>> {
  const contentLength = request.headers.get("content-length");
  const anunciado = contentLength == null ? null : Number(contentLength);
  if (anunciado != null && Number.isFinite(anunciado) && anunciado > maximoBytes) {
    return { ok: false, status: 413, mensaje: "La solicitud es demasiado grande." };
  }

  const lector = request.body?.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    if (lector) {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximoBytes) {
          await lector.cancel().catch(() => undefined);
          return { ok: false, status: 413, mensaje: "La solicitud es demasiado grande." };
        }
        partes.push(value);
      }
    }
  } catch {
    return { ok: false, status: 400, mensaje: "No pudimos leer la solicitud." };
  } finally {
    lector?.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    bytes.set(parte, offset);
    offset += parte.byteLength;
  }

  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, status: 400, mensaje: "La solicitud no contiene texto UTF-8 válido." };
  }
  try {
    return { ok: true, valor: JSON.parse(texto) as T };
  } catch {
    return { ok: false, status: 400, mensaje: "La solicitud contiene JSON inválido." };
  }
}
