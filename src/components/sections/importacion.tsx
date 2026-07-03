"use client";

import { MousePointerClick, Plane, Home } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";

/**
 * Sección "Importación Exclusiva".
 * Tres pasos: Selecciona → Importación Dubai → Pago en puerta.
 * Numeración legítima porque el contenido ES una secuencia real.
 */
export function Importacion() {
  const ref = useReveal<HTMLDivElement>({ stagger: 0.15 });

  return (
    <section
      id="importacion"
      ref={ref}
      className="relative z-10 border-y border-gold/10 bg-coal/60 px-6 py-28 backdrop-blur-md md:py-36"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center" data-reveal>
          <p className="eyebrow justify-center">El proceso Sultan</p>
          <h2 className="mt-5 font-display text-4xl text-ivory md:text-5xl">
            De Dubai a tu puerta
          </h2>
          <div className="gold-rule mx-auto mt-6" />
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-ivory/55">
            Tres pasos entre el secreto mejor guardado del Medio Oriente y
            tu mano: perfumes 100% originales, y tu elixir viaja asegurado
            y con rastreo directo hasta tu puerta.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: <MousePointerClick className="h-7 w-7" strokeWidth={1} />,
              titulo: "Selecciona",
              texto:
                "Elegí entre las fragancias árabes más codiciadas del mundo. Autenticidad garantizada en cada botella.",
            },
            {
              icon: <Plane className="h-7 w-7" strokeWidth={1} />,
              titulo: "Importación",
              texto:
                "Tu perfume viaja desde Dubai con trazabilidad y cuidado de temperatura. Frescura asegurada en cada envío.",
            },
            {
              icon: <Home className="h-7 w-7" strokeWidth={1} />,
              titulo: "Despacho exclusivo",
              texto:
                "Procesamiento inmediato y despacho exclusivo: tu fragancia viaja asegurada y con rastreo directo hasta tu puerta.",
              highlight: true,
            },
          ].map((paso, i) => (
            <div
              key={paso.titulo}
              data-reveal
              className={`glass-luxe rounded-sm p-8 text-center ${
                paso.highlight ? "border-gold/40" : ""
              }`}
            >
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-gold/20 bg-gold/[0.04] text-gold-champagne">
                {paso.icon}
              </div>
              <div className="mb-3 flex items-center justify-center gap-3">
                <span className="font-lapidary text-xs tracking-regal text-gold/60">
                  0{i + 1}
                </span>
                <span className="h-px w-6 bg-gold/30" />
              </div>
              <h3 className="font-display text-2xl text-ivory">
                {paso.titulo}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ivory/55">
                {paso.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
