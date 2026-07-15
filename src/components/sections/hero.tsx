"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ShieldCheck } from "lucide-react";

/**
 * Hero cinematográfico.
 * Apertura con la tesis de la marca: importación de Dubai, 100% originales,
 * envío asegurado a todo el país. (El "pago al recibir" se eliminó del sitio.)
 */
export function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-hero]"));
    items.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(28px)";
      el.style.transition =
        "opacity 1s cubic-bezier(0.22,1,0.36,1), transform 1s cubic-bezier(0.22,1,0.36,1)";
    });

    // ⚠️ Antes 1800ms (esperaba al loader) → mantenía el Hero (con el título LCP)
    // invisible ~3s y tanqueaba el LCP en Vercel. Bajado a 120ms + escalonado más
    // corto: la MISMA entrada, pero arranca casi al instante → LCP ~1.2s.
    const t = setTimeout(() => {
      items.forEach((el, i) => {
        el.style.transitionDelay = `${i * 0.08}s`;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
    }, 120);

    return () => clearTimeout(t);
  }, []);

  return (
    <header
      ref={rootRef}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-x-clip px-6 text-center"
    >
      {/* Velo inferior para integrar con el fondo 3D */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-obsidian/40 via-transparent to-obsidian" />

      <div className="relative z-10 mt-16 max-w-4xl">
        <p
          data-hero
          className="eyebrow mb-8 justify-center !text-gold !opacity-100"
        >
          La esencia de la realeza · Dubai → Paraguay
        </p>

        {/* Emblema del logo (el frasco) flotando con brillo pulsante */}
        <div data-hero className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/majalis-emblema.svg"
            alt=""
            aria-hidden
            className="majalis-emblema h-24 w-24 md:h-32 md:w-32"
          />
        </div>

        {/* MAJALIS — el LETTERING REAL del logo (máscara SVG) con el oro fluyendo
            adentro de las letras: idéntico a la imagen de marca. Se "escribe" de
            izquierda a derecha al entrar y el halo respira detrás. El ancho es
            fluido (88vw tope) → en el teléfono entra SIEMPRE completo. */}
        <h1 data-hero aria-label="Majalis" className="relative">
          <span aria-hidden className="majalis-halo" />
          <span aria-hidden className="marca-majalis marca-majalis--hero relative mx-auto" />
        </h1>

        <p
          data-hero
          className="mx-auto mt-8 max-w-xl text-balance text-lg font-light leading-relaxed text-ivory/80 md:text-xl"
        >
          La colección de perfumes más completa de Paraguay. Fragancias
          árabes, de diseñador y de nicho — 100% originales, con entrega
          en todo el país.
        </p>

        {/* CTAs */}
        <div
          data-hero
          className="mt-12 flex flex-col items-center justify-center gap-5 md:flex-row"
        >
          <button
            onClick={() =>
              document
                .getElementById("catalogo")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="btn-luxe"
          >
            Descubrir la colección
          </button>

          {/* Sello de confianza */}
          <div
            className="flex items-center gap-3 rounded-full border border-gold/40 bg-obsidian/60 px-6 py-3.5 backdrop-blur-md"
            title="Envío a todo el país"
          >
            <ShieldCheck
              className="h-5 w-5 text-gold-light"
              strokeWidth={1.5}
            />
            <span className="text-xs font-semibold uppercase tracking-regal text-ivory/90">
              Envío a todo el país
            </span>
          </div>
        </div>

        {/* Indicador de scroll */}
        <div
          data-hero
          className="mt-20 flex flex-col items-center gap-2 text-ivory/70"
        >
          <span className="text-xs uppercase tracking-imperial font-medium">
            Desplázate
          </span>
          <ArrowDown className="h-4 w-4 animate-bounce text-gold-light" strokeWidth={1.5} />
        </div>
      </div>
    </header>
  );
}
