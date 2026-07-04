"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useCatalog } from "@/hooks/use-catalog";

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
    // Activa el FILTRO DE MARCA del catálogo (no el buscador de texto) y baja hasta ahí.
    // Si esa marca no está en stock, el catálogo muestra el aviso de WhatsApp.
    window.dispatchEvent(new CustomEvent("majalis:filtrar-marca", { detail: m }));
    setAbierto(false);
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
          className={`btn-explorar group inline-flex items-center gap-2 rounded-full border border-gold/30 bg-obsidian/60 px-5 py-2 text-[0.65rem] font-semibold uppercase tracking-regal transition-all duration-300 hover:border-gold/70 ${abierto ? "" : "is-idle"}`}
        >
          <span className="explorar-txt">
            {abierto ? "Ocultar marcas" : `Explorar las ${marcas.length} marcas`}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-gold transition-transform duration-300 ${abierto ? "rotate-180" : ""}`}
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
                Ninguna marca coincide con “{busqueda}” — probá con otro nombre.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
