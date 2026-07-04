"use client";

import { Instagram, Facebook } from "lucide-react";
import { REDES_SOCIALES } from "@/data/site-config";

/**
 * Footer premium con iconografía de élite.
 * Las redes sociales se configuran en `src/data/site-config.ts`.
 */

/** Ícono de TikTok (no existe en lucide-react). */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

const ICONOS: Record<string, React.ElementType> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: TikTokIcon,
};

export function Footer() {
  return (
    <footer
      id="atelier"
      className="relative z-10 border-t border-gold/20 bg-coal/80 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
        {/* Bloque superior — promesa de marca */}
        <div className="mb-14 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <h2 aria-label="Majalis">
              <span aria-hidden className="marca-majalis w-44" />
            </h2>
            <p className="text-elixir-shimmer font-display text-lg font-semibold italic tracking-imperial drop-shadow-[0_0_10px_rgba(212,175,55,0.35)]">
              Perfumería árabe · Paraguay
            </p>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ivory/85">
              Traemos las fragancias más codiciadas del Medio Oriente
              directamente desde Dubai. Perfumes 100% originales, entrega
              discreta y envío asegurado a todo el país.
            </p>
          </div>

          <div>
            <h3 className="eyebrow mb-5 !text-gold !opacity-100">Navegación</h3>
            <ul className="space-y-3 text-base text-ivory/85">
              {[
                { label: "Colección", id: "catalogo" },
                { label: "Importación de Dubai", id: "importacion" },
                { label: "Favoritos del Sultán", id: "favoritos" },
              ].map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() =>
                      document
                        .getElementById(l.id)
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="transition-colors hover:text-gold-champagne"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="eyebrow mb-5 !text-gold !opacity-100">Atelier</h3>
            <ul className="space-y-3 text-base text-ivory/85">
              <li>Importación directa · Dubai → Paraguay</li>
              <li>Envío a todo el país · Rastreo directo</li>
              <li>Entrega discreta y coordinada</li>
            </ul>
          </div>
        </div>

        {/* Divisor dorado */}
        <div className="gold-rule mx-auto mb-10" />

        {/* Bloque inferior — marca + redes + legal */}
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="text-center md:text-left">
            <p className="text-sm font-bold uppercase tracking-imperial text-gold drop-shadow-[0_0_12px_rgba(212,175,55,0.45)]">
              Perfumes 100% originales
            </p>
          </div>

          {/* Redes sociales premium */}
          <div className="flex items-center gap-4">
            {REDES_SOCIALES.map((red) => {
              const Icono = ICONOS[red.tipo];
              return (
                <a
                  key={red.tipo}
                  href={red.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={red.label}
                  className={`social-luxe is-${red.tipo}`}
                >
                  <Icono className="h-5 w-5" strokeWidth={1.25} />
                </a>
              );
            })}
          </div>

          <div className="text-center md:text-right">
            <p className="font-display text-sm font-semibold tracking-regal text-ivory/90">
              © {new Date().getFullYear()}{" "}
              <span className="text-gold-champagne">Majalis</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
