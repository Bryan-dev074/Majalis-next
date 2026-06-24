"use client";

import { useState } from "react";
import { Coins, TrendingUp, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

/**
 * Dos botones encadenados para la pestaña "Mi Stock Local":
 *   1. "Actualizar Moneda"  → POST /api/sheets/moneda  (dólar + comparador)
 *   2. "Actualizar Precios" → POST /api/sheets/precios (precio mín. → productos)
 * El de Precios queda BLOQUEADO hasta usar el de Moneda. Solo uno a la vez.
 */
export default function MonedaPreciosButtons({
  toast,
}: {
  toast?: (tipo: "ok" | "error", texto: string) => void;
}) {
  const [monedaUsada, setMonedaUsada] = useState(false);
  const [cargando, setCargando] = useState<"moneda" | "precios" | null>(null);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const actualizarMoneda = async () => {
    if (cargando) return;
    setCargando("moneda");
    setEstado(null);
    try {
      const res = await fetch("/api/sheets/moneda", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        const texto = `Dólar ${data.dolar} Gs · ${data.productos ?? 0} producto(s) comparado(s). Ya podés actualizar precios.`;
        setMonedaUsada(true);
        setEstado({ tipo: "ok", texto });
        toast?.("ok", texto);
      } else {
        const texto = data.error ?? "Error al actualizar la moneda.";
        setEstado({ tipo: "error", texto });
        toast?.("error", texto);
      }
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Error de red.";
      setEstado({ tipo: "error", texto });
      toast?.("error", texto);
    } finally {
      setCargando(null);
    }
  };

  const actualizarPrecios = async () => {
    if (cargando || !monedaUsada) return;
    setCargando("precios");
    setEstado(null);
    try {
      const res = await fetch("/api/sheets/precios", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        const texto = `Precios actualizados en ${data.aplicados ?? 0} producto(s).`;
        setEstado({ tipo: "ok", texto });
        toast?.("ok", texto);
        setMonedaUsada(false); // vuelve a exigir actualizar moneda antes del próximo
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const texto = data.error ?? "Error al actualizar precios.";
        setEstado({ tipo: "error", texto });
        toast?.("error", texto);
      }
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Error de red.";
      setEstado({ tipo: "error", texto });
      toast?.("error", texto);
    } finally {
      setCargando(null);
    }
  };

  return (
    <div className="adm-feature-card mb-6">
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ color: "var(--adm-gold)", background: "var(--adm-blue-bg)" }}
        >
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: "var(--adm-text)" }}>
            💱 Cotización y Precios
          </h3>
          <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
            <strong>1)</strong> Actualizá la moneda (dólar + comparación de tiendas).{" "}
            <strong>2)</strong> Aplicá el mejor precio a tus productos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Paso 1 */}
        <button
          onClick={actualizarMoneda}
          disabled={cargando !== null}
          className="adm-btn adm-btn-gold"
        >
          {cargando === "moneda" ? (
            <><span className="adm-spinner" /> Actualizando…</>
          ) : (
            <><Coins className="h-4 w-4" /> 1 · Actualizar Moneda</>
          )}
        </button>

        {/* Paso 2 — bloqueado hasta usar Moneda */}
        <button
          onClick={actualizarPrecios}
          disabled={cargando !== null || !monedaUsada}
          className="adm-btn adm-btn-primary"
          title={!monedaUsada ? "Primero usá «Actualizar Moneda»" : undefined}
        >
          {cargando === "precios" ? (
            <><span className="adm-spinner" /> Aplicando…</>
          ) : !monedaUsada ? (
            <><Lock className="h-4 w-4" /> 2 · Actualizar Precios</>
          ) : (
            <><TrendingUp className="h-4 w-4" /> 2 · Actualizar Precios</>
          )}
        </button>
      </div>

      {estado && (
        <p
          className="mt-3 flex items-center gap-1.5 text-sm font-medium"
          style={{ color: estado.tipo === "ok" ? "var(--adm-green)" : "var(--adm-red)" }}
        >
          {estado.tipo === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {estado.texto}
        </p>
      )}
    </div>
  );
}
