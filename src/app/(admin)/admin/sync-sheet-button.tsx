"use client";

import { useState } from "react";
import { FileSpreadsheet, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface SyncResultado {
  ok: boolean;
  nuevos?: number;
  totalSupabase?: number;
  yaEnPlanilla?: number;
  rango?: string | null;
  detalle?: string;
  error?: string;
}

/**
 * Botón "Enviar productos nuevos a la planilla".
 * Llama a POST /api/sheets/sync (Supabase → Google Sheet, un solo sentido).
 * No toca precios: solo completa los productos que aún no están en la planilla
 * para que el scraping los encuentre.
 */
export default function SyncSheetButton({
  toast,
}: {
  toast?: (tipo: "ok" | "error", texto: string) => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [ultimo, setUltimo] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const sincronizar = async () => {
    if (cargando) return;
    setCargando(true);
    setUltimo(null);
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data: SyncResultado = await res.json();

      if (res.ok && data.ok) {
        const texto =
          (data.nuevos ?? 0) > 0
            ? `${data.nuevos} producto(s) nuevo(s) enviados a la planilla.`
            : "La planilla ya estaba al día. No había productos nuevos.";
        setUltimo({ tipo: "ok", texto });
        toast?.("ok", texto);
      } else {
        const texto = data.error ?? "Error al sincronizar con Google Sheets.";
        setUltimo({ tipo: "error", texto });
        toast?.("error", texto);
      }
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Error de red.";
      setUltimo({ tipo: "error", texto });
      toast?.("error", texto);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="adm-feature-card mb-6">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ color: "var(--adm-gold)", background: "var(--adm-blue-bg)" }}
          >
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--adm-text)" }}>
              📤 Enviar stock local a la planilla
            </h3>
            <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
              Agrega a la Google Sheet solo los productos de <strong>stock local</strong> que
              todavía no están (excluye Origen Externo y demos). Deja libres las columnas de
              precio para el scraping y no modifica los precios existentes.
            </p>
            {ultimo && (
              <p
                className="mt-2 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: ultimo.tipo === "ok" ? "var(--adm-green)" : "var(--adm-red)" }}
              >
                {ultimo.tipo === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {ultimo.texto}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={sincronizar}
          disabled={cargando}
          className="adm-btn adm-btn-gold shrink-0"
        >
          {cargando ? (
            <>
              <span className="adm-spinner" /> Enviando…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" /> Sincronizar planilla
            </>
          )}
        </button>
      </div>
    </div>
  );
}
