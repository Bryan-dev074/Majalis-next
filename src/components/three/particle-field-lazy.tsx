"use client";

import dynamic from "next/dynamic";

/**
 * Carga DIFERIDA del fondo de partículas. three.js (~128 KB gz) salía en el
 * bundle crítico de la home porque el layout (Server Component) lo importaba
 * estático. Como el fondo es 100% decorativo y client-only, se monta después
 * de la hidratación (ssr:false) → la página pinta e interactúa antes, y el
 * polvo dorado aparece un instante después con un fade natural.
 */
export const ParticleFieldLazy = dynamic(
  () => import("./particle-field").then((m) => m.ParticleField),
  { ssr: false }
);
