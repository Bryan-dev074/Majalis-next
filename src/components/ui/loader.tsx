"use client";

import { useEffect, useState } from "react";

/**
 * Loader de apertura — entrada cinemática de marca.
 * Se desvanece tras 1.8s. Respeta reduced-motion (CSS global).
 */
export function Loader() {
  // Una sola vez por sesión: el visitante recurrente (navega entre páginas o
  // vuelve) NO paga la intro de nuevo → entra directo.
  const [oculto, setOculto] = useState(false);
  const [fase, setFase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (sessionStorage.getItem("majalis_intro")) {
      setOculto(true);
      return;
    }
    sessionStorage.setItem("majalis_intro", "1");
    // Tiempos recortados (antes 1500/2100 → 1100/1650 → 600/1000) para que el loader
    // NO sea el techo del LCP en la primera visita: en cuanto se levanta, el Hero ya
    // está escrito debajo. Sigue siendo una apertura de marca, pero snappy.
    const t1 = setTimeout(() => setFase("out"), 600);
    const t2 = setTimeout(() => setOculto(true), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (oculto) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-obsidian transition-opacity duration-500 ${
        fase === "out" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      {/* Resplandor radial dorado */}
      <div className="absolute inset-0 bg-radial-gold opacity-60" />

      <div className="relative flex flex-col items-center">
        <p
          className="eyebrow mb-6 animate-fade-up"
          style={{ animationDelay: "0.1s", opacity: 0 }}
        >
          Importación directa de Dubai
        </p>

        <h1 aria-label="Majalis">
          <span aria-hidden className="marca-majalis mx-auto w-[min(70vw,20rem)]" />
        </h1>

        {/* Línea de carga con barrido dorado */}
        <div className="relative mt-8 h-px w-56 overflow-hidden bg-smoke">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--gold-light), transparent)",
              animation: "loader-sweep 1.5s ease-in-out infinite",
            }}
          />
        </div>

        <p className="mt-6 text-[0.6rem] tracking-imperial uppercase text-ivory/40">
          Abriendo la cámara olfativa
        </p>
      </div>
    </div>
  );
}
