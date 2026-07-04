"use client";

import { useEffect, useRef, useState } from "react";
import { useCatalog } from "@/hooks/use-catalog";
import { buildWaLink } from "@/data/site-config";

/**
 * Banda "disponibles hoy" — entre el hero y las casas perfumistas.
 * · Contador animado (cuenta desde 0 al entrar en pantalla) con la cantidad
 *   REAL de perfumes disponibles (el catálogo vivo de la tienda).
 * · CTA: "¿No encontrás el tuyo? Verificá su stock por WhatsApp" — el link
 *   lleva brillo dorado en movimiento + subrayado que respira (.wa-link).
 */
export function DisponiblesCta() {
  const { perfumes } = useCatalog();
  const total = perfumes.length;

  const ref = useRef<HTMLSpanElement>(null);
  const [mostrado, setMostrado] = useState(0);
  const animado = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || total === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setMostrado(total); return; }

    let garantia: ReturnType<typeof setTimeout> | null = null;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || animado.current) return;
        animado.current = true;
        const t0 = performance.now();
        const dur = 1400;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
          setMostrado(Math.round(total * ease));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        // GARANTÍA: si el navegador congela los rAF (pestaña sin foco, ahorro de
        // batería), el número final queda puesto igual — nunca un "0" clavado.
        garantia = setTimeout(() => setMostrado(total), dur + 400);
        obs.disconnect();
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    // RED DE SEGURIDAD: si el IntersectionObserver nunca dispara (renderer
    // congelado, webview rara, lector de pantalla), el número real aparece
    // igual a los 3s — la animación es un lujo, el dato es obligatorio.
    const respaldo = setTimeout(() => {
      if (!animado.current) { animado.current = true; setMostrado(total); }
    }, 3000);
    return () => { obs.disconnect(); clearTimeout(respaldo); if (garantia) clearTimeout(garantia); };
  }, [total]);

  // Si el catálogo llega DESPUÉS de la animación (refresco), mantener el número al día.
  useEffect(() => {
    if (animado.current) setMostrado(total);
  }, [total]);

  const waLink = buildWaLink(
    "Hola Majalis! Quiero verificar el stock de un perfume 🙌"
  );

  return (
    <section
      aria-label="Perfumes disponibles hoy"
      data-total={total}
      className="relative overflow-x-clip border-t border-gold/10 bg-obsidian/60 px-6 py-10 md:py-12"
    >
      {/* Resplandor sutil de fondo para separar del hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center md:flex-row md:justify-center md:gap-14">
        {/* Contador */}
        <div className="flex items-baseline gap-4">
          <span
            ref={ref}
            className="text-gold-gradient font-display text-6xl font-semibold leading-none tabular-nums md:text-7xl"
          >
            {mostrado.toLocaleString("es-PY")}
          </span>
          <span className="max-w-[11rem] text-left text-[0.7rem] font-semibold uppercase leading-relaxed tracking-regal text-ivory/75">
            perfumes originales disponibles hoy
          </span>
        </div>

        {/* Divisor vertical (solo desktop) */}
        <span aria-hidden className="hidden h-14 w-px bg-gradient-to-b from-transparent via-gold/40 to-transparent md:block" />

        {/* CTA WhatsApp */}
        <p className="max-w-md text-balance text-lg font-light leading-relaxed text-ivory/85 md:text-xl">
          ¿No encontrás el tuyo?{" "}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="wa-link whitespace-nowrap"
          >
            ¡Verificá su stock por WhatsApp!
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="wa-latido ml-1.5 inline h-[1.05em] w-[1.05em] fill-[#25d366]"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
          </a>
        </p>
      </div>
    </section>
  );
}
