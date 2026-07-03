"use client";

import { useMemo } from "react";
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
    </section>
  );
}
