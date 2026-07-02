"use client";

import { useMemo } from "react";
import { useCatalog } from "@/hooks/use-catalog";

/**
 * Cinta infinita de marcas ("todas estas casas están acá").
 * Sin logos externos a propósito: tipografía lapidaria dorada sobre fondo
 * transparente — se ve premium en cualquier pantalla y no depende de PNGs
 * de terceros. Las marcas salen del catálogo real (fallback si está vacío).
 */
const MARCAS_FALLBACK = [
  "Lattafa", "Armaf", "Afnan", "Rasasi", "Rayhaan", "Bharara",
  "Al Wataniah", "Maison Alhambra", "Al Haramain", "French Avenue",
];

export function MarcasMarquee() {
  const { perfumes } = useCatalog();

  const marcas = useMemo(() => {
    const set = new Set<string>();
    for (const p of perfumes) if (p.marca?.trim()) set.add(p.marca.trim());
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    return list.length >= 4 ? list : MARCAS_FALLBACK;
  }, [perfumes]);

  // Dos copias seguidas: cuando la primera terminó de salir (-50%), la segunda
  // está exactamente donde arrancó la primera → loop perfecto sin saltos.
  const fila = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"}>
      {marcas.map((m) => (
        <span key={`${key}-${m}`} className="flex items-center">
          <span className="whitespace-nowrap font-lapidary text-sm uppercase tracking-imperial text-gold/60 transition-colors md:text-base">
            {m}
          </span>
          <span className="mx-6 text-[0.5rem] text-gold/35 md:mx-10">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <section
      aria-label="Casas perfumistas disponibles"
      className="relative overflow-hidden border-y border-gold/10 bg-obsidian/40 py-4 md:py-5"
    >
      {/* Fundido en los bordes para que entre/salga elegante */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-obsidian to-transparent md:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-obsidian to-transparent md:w-32" />

      <div className="marquee-luxe flex w-max">
        {fila("a")}
        {fila("b")}
      </div>
    </section>
  );
}
