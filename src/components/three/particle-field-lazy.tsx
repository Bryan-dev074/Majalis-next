"use client";

import dynamic from "next/dynamic";

/**
 * Carga DIFERIDA del fondo de partículas (13-jul): three.js (~150 KB gz) salía
 * en el bundle crítico de la primera pintura. Como el fondo es decorativo,
 * se monta después de la hidratación (ssr:false + chunk propio) — la página
 * pinta antes y el polvo dorado aparece con un fade natural.
 */
export const ParticleFieldLazy = dynamic(
  () => import("./particle-field").then((m) => m.ParticleField),
  { ssr: false }
);
