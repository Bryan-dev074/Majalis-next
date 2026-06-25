import { TIENDAS_AUTOMATICAS, type TiendaConfig } from "@/data/tiendas-config";
import { fetchConReintento } from "@/lib/asistente-cache";

/**
 * Motor de búsqueda de un producto en las 11 tiendas HTML (Flujo B del asistente).
 * Por cada tienda busca el producto por fetch directo (gratis, sin API paga),
 * extrae hasta 3 candidatos (título, URL, precio) y Gemini puntúa cuál es el
 * correcto. Devuelve los datos para la tabla semáforo del panel.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface Candidato { titulo: string; url: string; precio: string; }
export type Semaforo = "verde" | "amarillo" | "rojo";

export interface ResultadoTienda {
  id: string;
  tienda: string;
  urlTienda: string;
  candidatos: Candidato[];
  /** índice del candidato pre-seleccionado por la IA; -1 si ninguno. */
  mejorIndice: number;
  /** 0-100. */
  confianza: number;
  semaforo: Semaforo;
  nota?: string;
}

/** Descarga el HTML de una página por fetch directo (sin API de scraping). */
async function descargar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// ── Helpers genéricos ───────────────────────────────────────────────────────
const Q = (s: string) => encodeURIComponent(s);

/** Precio de la página de producto: JSON-LD ("price"), luego Gs/USD visible. */
function extraerPrecio(html: string): string {
  const jl = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i)?.[1];
  if (jl) {
    const n = Math.round(parseFloat(jl));
    if (n >= 1000) return `Gs ${n.toLocaleString("es-PY")}`;
  }
  const gs = html.match(/(?:₲|Gs\.?|G\$)\s*([\d]{1,3}(?:\.\d{3})+)/)?.[1];
  if (gs) return `Gs ${gs}`;
  const usd = html.match(/U\$\s*([\d.,]+)/)?.[1];
  if (usd) return `U$ ${usd}`;
  return "—";
}

/** Título: og:title → h1 (si no es "carrito") → slug humanizado. */
function extraerTitulo(html: string, url: string): string {
  const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]?.trim();
  if (og && !/carr|cart/i.test(og)) return og.slice(0, 70);
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  if (h1 && !/carr|cart/i.test(h1)) return h1.slice(0, 70);
  return (url.split("/").filter(Boolean).pop() || "").replace(/[-_]/g, " ").slice(0, 60);
}

/** Patrón genérico: búsqueda → links de producto → página de cada uno → precio. */
async function viaProductos(searchUrl: string, linkRe: RegExp): Promise<Candidato[]> {
  const sh = await descargar(searchUrl);
  if (!sh) return [];
  const links = [...new Set([...sh.matchAll(linkRe)].map((m) => m[1]))]
    .map((u) => (u.startsWith("http") ? u : `https:${u}`))
    .slice(0, 3);
  const out: Candidato[] = [];
  for (const url of links) {
    const ph = await descargar(url);
    if (!ph) continue;
    out.push({ titulo: extraerTitulo(ph, url), url, precio: extraerPrecio(ph) });
  }
  return out;
}

// ── Buscadores por tienda ───────────────────────────────────────────────────
async function buscarCandidatos(t: TiendaConfig, nombre: string): Promise<Candidato[]> {
  const q = Q(nombre);

  // Pionner (OpenCart) — precio en el listado de resultados.
  if (t.id === "pionner") {
    const html = await descargar(`https://www.pionnershop.com/index.php?route=product/search&search=${q}`);
    if (!html) return [];
    const out: Candidato[] = [];
    const re = /<a class="d-flex flex-column gap-3" href="(https:\/\/www\.pionnershop\.com\/[^"]+)"/gi;
    const vistos = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 3) {
      const link = m[1];
      if (vistos.has(link)) continue;
      vistos.add(link);
      const ph = await descargar(link);
      const blk = ph ? ph.substring(ph.indexOf("price-product"), ph.indexOf("price-product") + 2600) : "";
      const usd = blk.match(/U\$\s*([\d.,]+)/)?.[1];
      const gs = blk.match(/G\$\s*([\d.,]+)/)?.[1];
      out.push({ titulo: ph ? extraerTitulo(ph, link) : link, url: link, precio: gs ? `G$ ${gs}` : usd ? `U$ ${usd}` : "—" });
    }
    return out;
  }

  // Cellshop (Magento) — link + precio en el listado (data-price-amount).
  if (t.id === "cellshop") {
    const html = await descargar(`https://cellshop.com.py/catalogsearch/result/?q=${q}`);
    if (!html) return [];
    const out: Candidato[] = [];
    const vistos = new Set<string>();
    const re = /<a class="product-item-link"\s+href="([^"]+)">([\s\S]*?)<\/a>([\s\S]{0,1500})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 3) {
      const url = m[1];
      if (vistos.has(url)) continue;
      vistos.add(url);
      const p = m[3].match(/data-price-amount="(\d+)"/)?.[1];
      out.push({ titulo: m[2].replace(/\s+/g, " ").trim().slice(0, 60), url, precio: p ? `Gs ${Number(p).toLocaleString("es-PY")}` : "—" });
    }
    return out;
  }

  // Aroma Store — links /product/.
  if (t.id === "aroma")
    return viaProductos(`https://aromastore.com.py/?s=${q}`, /href="(https:\/\/aromastore\.com\.py\/product\/[^"]+)"/gi);

  // Shopping China — links /producto/{id}.
  if (t.id === "shoppingchina")
    return viaProductos(`https://www.shoppingchina.com.py/?s=${q}`, /href="(https?:\/\/(?:www\.)?shoppingchina\.com\.py\/producto\/\d+)"/gi);

  // La Perfumería — WooCommerce, links /producto/.
  if (t.id === "laperfumeria")
    return viaProductos(`https://laperfumeria.com.py/?s=${q}&post_type=product`, /href="(https:\/\/laperfumeria\.com\.py\/producto\/[^"]+)"/gi);

  // Resto (elegancia, pontocom, mega, terranova, matrix): parser por agregar.
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

  const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
    const r = await fetchConReintento(
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

/** Orquesta la búsqueda en las 11 tiendas + la puntuación de la IA. */
export async function buscarEnTodasLasTiendas(nombre: string): Promise<ResultadoTienda[]> {
  // 1) Búsqueda en paralelo en todas las tiendas.
  const busquedas = await Promise.all(
    TIENDAS_AUTOMATICAS.map(async (t) => ({ t, candidatos: await buscarCandidatos(t, nombre) }))
  );

  // 2) Puntuación con Gemini.
  const puntajes = await puntuar(
    nombre,
    busquedas.map((b) => ({ id: b.t.id, candidatos: b.candidatos }))
  );

  // 3) Armar el resultado para la tabla semáforo.
  return busquedas.map(({ t, candidatos }) => {
    const p = puntajes[t.id] ?? { mejorIndice: candidatos.length ? 0 : -1, confianza: candidatos.length ? 50 : 0 };
    const hay = candidatos.length > 0 && p.mejorIndice >= 0;
    return {
      id: t.id, tienda: t.nombre, urlTienda: t.urlBase,
      candidatos, mejorIndice: hay ? p.mejorIndice : -1, confianza: hay ? p.confianza : 0,
      semaforo: semaforoDe(p.confianza, hay),
      nota: candidatos.length === 0 ? "Parser pendiente / búsqueda manual" : undefined,
    };
  });
}
