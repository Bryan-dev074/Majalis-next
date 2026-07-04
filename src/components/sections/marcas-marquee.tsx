"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useCatalog } from "@/hooks/use-catalog";
import { buildWaLink } from "@/data/site-config";

/** Link de WhatsApp para consultar stock (el CTA vive bajo las casas perfumistas). */
const WA_STOCK = buildWaLink("Hola Majalis! Quiero verificar el stock de un perfume 🙌");

/**
 * Cinta infinita de marcas ("todas estas casas están acá").
 * Sin logos externos a propósito: tipografía lapidaria dorada sobre fondo
 * transparente — se ve premium en cualquier pantalla y no depende de PNGs
 * de terceros.
 *
 * Rediseño 03-jul-2026 (pedido del dueño):
 *  · TODAS las marcas que maneja el negocio (MARCAS_BASE = las 82 del catálogo
 *    maestro del Hub, horneadas; se une con las del catálogo vivo de la tienda).
 *  · Cada nombre lleva un BRILLO dorado que lo recorre constantemente
 *    (.marca-shimmer en globals.css, con delays escalonados → efecto ola).
 *  · Mucho más legible: base oro pleno con barrido marfil, ya no /60 opaco.
 *  · Las ✦ titilan (.estrella-marquee). Pausa on-hover se mantiene.
 */
const MARCAS_BASE = [
  "Acqua di Parma", "Afnan", "Al Haramain", "Al Wataniah", "Antonio Banderas",
  "Ariana Grande", "Armaf", "Azzaro", "Benetton", "Bharara", "Britney Spears",
  "Burberry", "Bvlgari", "Byredo", "Cacharel", "Calvin Klein", "Carolina Herrera",
  "Cartier", "Chanel", "Chloé", "Clinique", "Creed", "Davidoff", "Dior",
  "Dolce & Gabbana", "Elie Saab", "Elizabeth Arden", "Escentric Molecules",
  "Fragrance World", "French Avenue", "Giorgio Armani", "Givenchy", "Guerlain",
  "Guy Laroche", "Hermès", "Hugo Boss", "Initio", "Issey Miyake", "Jacques Bogart",
  "Jaguar", "Jean Paul Gaultier", "Jo Malone", "Joop!", "Juliette Has A Gun",
  "Kenzo", "Kilian", "Lacoste", "Lalique", "Lancôme", "Lattafa", "Le Labo",
  "Loewe", "Maison Alhambra", "Maison Francis K.", "Mancera", "Marc Jacobs",
  "Montale", "Montblanc", "Moschino", "Mugler", "Narciso Rodriguez", "Nautica",
  "Nina Ricci", "Nishane", "Orientica", "Paco Rabanne", "Parfums de Marly",
  "Paris Corner", "Paris Hilton", "Perry Ellis", "Prada", "Ralph Lauren",
  "Rasasi", "Rayhaan", "Shakira", "Ted Lapidus", "Tom Ford", "Valentino",
  "Versace", "Viktor & Rolf", "Xerjoff", "Yves Saint Laurent",
];

export function MarcasMarquee() {
  const { perfumes } = useCatalog();

  const marcas = useMemo(() => {
    // Unión: catálogo vivo de la tienda + todas las casas del negocio.
    const set = new Set<string>(MARCAS_BASE);
    for (const p of perfumes) if (p.marca?.trim()) set.add(p.marca.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [perfumes]);

  // Velocidad constante en px/s aunque crezca la lista: duración ∝ cantidad.
  const duracion = `${Math.max(60, marcas.length * 3.4)}s`;

  // ── Explorador de marcas: desplegable + buscador (04-jul) ──
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? marcas.filter((m) => m.toLowerCase().includes(q)) : marcas;
  }, [marcas, busqueda]);
  const elegirMarca = (m: string) => {
    // Mismo evento que usa el buscador del navbar → filtra el catálogo en vivo.
    window.dispatchEvent(new CustomEvent("sultan:search", { detail: m }));
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
  };

  // Dos copias seguidas: cuando la primera terminó de salir (-50%), la segunda
  // está exactamente donde arrancó la primera → loop perfecto sin saltos.
  const fila = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"}>
      {marcas.map((m, i) => (
        <span key={`${key}-${m}`} className="flex items-center">
          <span
            className="marca-shimmer whitespace-nowrap font-lapidary text-sm uppercase tracking-imperial md:text-base"
            style={{ animationDelay: `-${(i % 14) * 0.42}s` }}
          >
            {m}
          </span>
          <span
            className="estrella-marquee mx-6 text-[0.55rem] text-gold/70 md:mx-10"
            style={{ animationDelay: `-${(i % 7) * 0.4}s` }}
          >
            ✦
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <section
      aria-label="Casas perfumistas disponibles"
      className="relative overflow-hidden border-y border-gold/15 bg-obsidian/40 py-4 md:py-5"
    >
      {/* Fundido en los bordes para que entre/salga elegante */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-obsidian to-transparent md:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-obsidian to-transparent md:w-32" />

      <div className="marquee-luxe flex w-max" style={{ animationDuration: duracion }}>
        {fila("a")}
        {fila("b")}
      </div>

      {/* ── EXPLORADOR DE MARCAS (04-jul): con 80+ casas la cinta sola no alcanza.
          Desplegable con buscador — clic en una marca filtra el catálogo. ── */}
      <div className="relative z-20 mt-3 flex flex-col items-center px-4">
        <button
          onClick={() => { setAbierto((v) => !v); setBusqueda(""); }}
          aria-expanded={abierto}
          aria-controls="panel-marcas"
          className="group inline-flex items-center gap-2 rounded-full border border-gold/25 bg-obsidian/60 px-5 py-2 text-[0.65rem] font-semibold uppercase tracking-regal text-gold/90 transition-all duration-300 hover:border-gold/60 hover:text-gold-champagne"
        >
          {abierto ? "Ocultar marcas" : `Explorar las ${marcas.length} marcas`}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${abierto ? "rotate-180" : ""}`}
            strokeWidth={1.5}
          />
        </button>

        <div
          id="panel-marcas"
          className={`grid w-full max-w-4xl transition-all duration-500 ease-in-out ${
            abierto ? "mt-5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            {/* Buscador de marca */}
            <div className="relative mx-auto mb-4 max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/50" strokeWidth={1.5} />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscá tu casa perfumista…"
                aria-label="Buscar marca"
                className="w-full rounded-full border border-gold/25 bg-obsidian/70 py-2.5 pl-10 pr-9 text-sm text-ivory placeholder:text-ivory/35 outline-none transition-colors focus:border-gold/60"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 transition-colors hover:text-gold"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* Chips: clic → filtra el catálogo y te lleva ahí */}
            {filtradas.length ? (
              <div className="grid grid-cols-2 gap-2 pb-5 sm:grid-cols-3 md:grid-cols-4">
                {filtradas.map((m) => (
                  <button
                    key={m}
                    onClick={() => elegirMarca(m)}
                    className="truncate rounded-lg border border-gold/15 bg-obsidian/50 px-3 py-2.5 text-[0.7rem] font-medium uppercase tracking-wider text-ivory/75 transition-all duration-300 hover:border-gold/55 hover:bg-gold/5 hover:text-gold-champagne"
                    title={`Ver perfumes de ${m}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              <p className="pb-5 text-center text-sm text-ivory/50">
                Ninguna marca coincide con “{busqueda}” — probá con otro nombre o
                consultanos por WhatsApp aquí abajo.
              </p>
            )}
          </div>
        </div>

        {/* CTA de stock — discreto, justo debajo de las casas perfumistas */}
        <p className="mb-1 mt-4 text-center text-sm font-light text-ivory/70 md:text-base">
          ¿No encontrás el tuyo?{" "}
          <a
            href={WA_STOCK}
            target="_blank"
            rel="noopener noreferrer"
            className="wa-link whitespace-nowrap"
          >
            ¡Verificá su stock por WhatsApp!
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="wa-latido ml-1.5 inline h-[1em] w-[1em] fill-[#25d366]"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
          </a>
        </p>
      </div>
    </section>
  );
}
