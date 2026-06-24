import { TIENDAS_AUTOMATICAS, type TiendaConfig } from "@/data/tiendas-config";

/**
 * Motor de búsqueda de un producto en TODAS las tiendas (Flujo B del asistente).
 * Por cada tienda automática busca el producto, extrae hasta 3 candidatos
 * (título, URL, precio) y Gemini puntúa cuál es el correcto. Devuelve los datos
 * para la tabla semáforo del panel.
 *
 * Las tiendas con metodo "api" (403 / JS) se consultan a través de una API de
 * scraping (Crawlbase o ScrapingBee), configurable por env:
 *   SCRAPER_PROVIDER = "crawlbase" | "scrapingbee"
 *   SCRAPER_API_KEY  = token de la API
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface Candidato { titulo: string; url: string; precio: string; }
export type Semaforo = "verde" | "amarillo" | "rojo";

export interface ResultadoTienda {
  id: string;
  tienda: string;
  metodo: TiendaConfig["metodo"];
  urlTienda: string;
  candidatos: Candidato[];
  /** índice del candidato pre-seleccionado por la IA; -1 si ninguno. */
  mejorIndice: number;
  /** 0-100. */
  confianza: number;
  semaforo: Semaforo;
  nota?: string;
}

/** Descarga HTML: directo para "html", vía API de scraping para "api". */
async function descargar(url: string, metodo: TiendaConfig["metodo"]): Promise<string | null> {
  try {
    if (metodo === "api") {
      const prov = (process.env.SCRAPER_PROVIDER || "crawlbase").toLowerCase();
      const key = process.env.SCRAPER_API_KEY;
      if (!key) return null; // sin API key no se puede; el caller lo marca como pendiente
      const apiUrl =
        prov === "scrapingbee"
          ? `https://app.scrapingbee.com/api/v1/?api_key=${key}&url=${encodeURIComponent(url)}&render_js=true`
          : `https://api.crawlbase.com/?token=${key}&url=${encodeURIComponent(url)}`;
      const r = await fetch(apiUrl);
      return r.ok ? await r.text() : null;
    }
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// ── Buscadores por tienda. Se agrega un caso por dominio a medida que se valida.
async function buscarCandidatos(t: TiendaConfig, nombre: string): Promise<Candidato[]> {
  // Pionner Shop — validado: búsqueda por término → resultados con link y precio.
  if (t.id === "pionner") {
    const url = `https://www.pionnershop.com/index.php?route=product/search&search=${encodeURIComponent(nombre)}`;
    const html = await descargar(url, "html");
    if (!html) return [];
    const out: Candidato[] = [];
    const re = /href="(https:\/\/www\.pionnershop\.com\/[a-z0-9][a-z0-9-]{8,}[A-Za-z]{1,3})"/gi;
    const vistos = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 3) {
      const link = m[1];
      if (vistos.has(link)) continue;
      vistos.add(link);
      const ph = await descargar(link, "html");
      const blk = ph ? ph.substring(ph.indexOf("price-product"), ph.indexOf("price-product") + 2600) : "";
      const usd = blk.match(/U\$\s*([\d.,]+)/)?.[1];
      const gs = blk.match(/G\$\s*([\d.,]+)/)?.[1];
      const titulo = ph?.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? link.split("/").pop() ?? "";
      out.push({ titulo, url: link, precio: gs ? `G$ ${gs}` : usd ? `U$ ${usd}` : "—" });
    }
    return out;
  }

  // Resto de tiendas "html"/"api": framework listo, parser por agregar.
  // (Ver scraping.md: cada tienda tiene su patrón de URL/búsqueda y selector.)
  return [];
}

/** Semáforo a partir de la confianza de la IA y si hubo candidatos. */
function semaforoDe(confianza: number, hayCandidatos: boolean): Semaforo {
  if (!hayCandidatos) return "rojo";
  if (confianza >= 90) return "verde";
  if (confianza >= 50) return "amarillo";
  return "rojo";
}

/** Puntuación con Gemini: por tienda, qué candidato matchea y con qué confianza. */
async function puntuar(
  nombre: string,
  porTienda: { id: string; candidatos: Candidato[] }[]
): Promise<Record<string, { mejorIndice: number; confianza: number }>> {
  const conCandidatos = porTienda.filter((p) => p.candidatos.length > 0);
  if (!conCandidatos.length) return {};

  const apiKey = process.env.GEMINI_API_KEY;
  // Sin Gemini: heurística simple — primer candidato, confianza media.
  if (!apiKey) {
    const out: Record<string, { mejorIndice: number; confianza: number }> = {};
    for (const p of conCandidatos) out[p.id] = { mejorIndice: 0, confianza: 60 };
    return out;
  }

  const modelo = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const lista = conCandidatos
    .map((p) => `Tienda ${p.id}:\n` + p.candidatos.map((c, i) => `  [${i}] ${c.titulo} (${c.precio})`).join("\n"))
    .join("\n");
  const prompt =
    `El usuario busca el perfume: "${nombre}".\n` +
    `Para cada tienda, elegí cuál de sus candidatos es el MISMO perfume (misma marca, nombre y ml) ` +
    `y asignale una confianza 0-100. Si ninguno matchea, mejorIndice = -1.\n\n${lista}`;
  const schema = {
    type: "OBJECT",
    properties: {
      evaluaciones: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            tienda: { type: "STRING" },
            mejorIndice: { type: "INTEGER" },
            confianza: { type: "INTEGER" },
          },
          required: ["tienda", "mejorIndice", "confianza"],
        },
      },
    },
    required: ["evaluaciones"],
  };
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
        }),
      }
    );
    const data = await r.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = txt ? JSON.parse(txt) : { evaluaciones: [] };
    const out: Record<string, { mejorIndice: number; confianza: number }> = {};
    for (const e of parsed.evaluaciones ?? []) {
      out[e.tienda] = { mejorIndice: Number(e.mejorIndice), confianza: Number(e.confianza) || 0 };
    }
    return out;
  } catch {
    const out: Record<string, { mejorIndice: number; confianza: number }> = {};
    for (const p of conCandidatos) out[p.id] = { mejorIndice: 0, confianza: 50 };
    return out;
  }
}

/** Orquesta la búsqueda en todas las tiendas + la puntuación de la IA. */
export async function buscarEnTodasLasTiendas(nombre: string): Promise<ResultadoTienda[]> {
  // 1) Búsqueda en paralelo en las tiendas automáticas.
  const busquedas = await Promise.all(
    TIENDAS_AUTOMATICAS.map(async (t) => ({ t, candidatos: await buscarCandidatos(t, nombre) }))
  );

  // 2) Puntuación con Gemini.
  const puntajes = await puntuar(
    nombre,
    busquedas.map((b) => ({ id: b.t.id, candidatos: b.candidatos }))
  );

  // 3) Armar el resultado para la tabla semáforo (incluye también las manuales).
  const automaticas: ResultadoTienda[] = busquedas.map(({ t, candidatos }) => {
    const p = puntajes[t.id] ?? { mejorIndice: candidatos.length ? 0 : -1, confianza: candidatos.length ? 50 : 0 };
    const hay = candidatos.length > 0 && p.mejorIndice >= 0;
    return {
      id: t.id, tienda: t.nombre, metodo: t.metodo, urlTienda: t.urlBase,
      candidatos, mejorIndice: hay ? p.mejorIndice : -1, confianza: hay ? p.confianza : 0,
      semaforo: semaforoDe(p.confianza, hay),
      nota: candidatos.length === 0 ? (t.metodo === "api" && !process.env.SCRAPER_API_KEY ? "Falta API de scraping" : "Parser pendiente / búsqueda manual") : undefined,
    };
  });

  return automaticas;
}
