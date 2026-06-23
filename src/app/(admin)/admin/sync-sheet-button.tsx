"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileSpreadsheet, RefreshCw, AlertTriangle, ShieldCheck,
} from "lucide-react";

interface VerifyResp {
  ok: boolean;
  sincronizado?: boolean;
  totalLocal?: number;
  enPlanilla?: number;
  faltantes?: number;
  desactualizados?: number;
  agregados?: number;
  actualizados?: number;
  detalle?: string;
  error?: string;
}

type Estado =
  | { tipo: "cargando"; texto: string }
  | { tipo: "ok"; texto: string } // todo sincronizado → verde
  | { tipo: "warn"; texto: string } // hay pendientes → ámbar
  | { tipo: "error"; texto: string }
  | null;

/**
 * Tarjeta "Enviar stock local a la planilla".
 *  · Al montar verifica el estado (GET, solo lectura) y lo pinta.
 *  · "Verificar" re-chequea.  "Sincronizar planilla" agrega/corrige (POST).
 * No toca precios: solo datos básicos de los productos de stock local.
 */
export default function SyncSheetButton({
  toast,
}: {
  toast?: (tipo: "ok" | "error", texto: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>(null);
  const [verificando, setVerificando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const aplicar = useCallback((data: VerifyResp, httpOk: boolean) => {
    if (httpOk && data.ok) {
      if (data.sincronizado) {
        setEstado({
          tipo: "ok",
          texto:
            data.detalle ??
            "Todos los productos de stock local están bien actualizados.",
        });
      } else {
        const partes: string[] = [];
        if (data.faltantes) partes.push(`${data.faltantes} sin enviar`);
        if (data.desactualizados) partes.push(`${data.desactualizados} desactualizado(s)`);
        setEstado({
          tipo: "warn",
          texto: `Hay ${partes.join(" · ")}. Apretá "Sincronizar planilla".`,
        });
      }
    } else {
      setEstado({ tipo: "error", texto: data.error ?? "Error al consultar la planilla." });
    }
  }, []);

  const verificar = useCallback(async () => {
    setVerificando(true);
    setEstado({ tipo: "cargando", texto: "Verificando estado de la planilla…" });
    try {
      const res = await fetch("/api/sheets/sync", { method: "GET" });
      aplicar(await res.json(), res.ok);
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "Error de red." });
    } finally {
      setVerificando(false);
    }
  }, [aplicar]);

  // Verificar automáticamente al abrir la pestaña.
  useEffect(() => {
    verificar();
  }, [verificar]);

  const sincronizar = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    setEstado({ tipo: "cargando", texto: "Sincronizando con la planilla…" });
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data: VerifyResp = await res.json();
      aplicar(data, res.ok);
      if (res.ok && data.ok) {
        const cambios = (data.agregados ?? 0) + (data.actualizados ?? 0);
        toast?.(
          "ok",
          cambios > 0
            ? `${data.agregados ?? 0} agregado(s) y ${data.actualizados ?? 0} actualizado(s).`
            : "La planilla ya estaba al día."
        );
      } else {
        toast?.("error", data.error ?? "Error al sincronizar.");
      }
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Error de red.";
      setEstado({ tipo: "error", texto });
      toast?.("error", texto);
    } finally {
      setSincronizando(false);
    }
  };

  // Colores del banner de estado según el tipo.
  const banner = (() => {
    if (!estado) return null;
    const map = {
      ok: { color: "var(--adm-green)", bg: "var(--adm-green-bg)", icon: <ShieldCheck className="h-4 w-4" /> },
      warn: { color: "var(--adm-amber)", bg: "var(--adm-amber-bg)", icon: <AlertTriangle className="h-4 w-4" /> },
      error: { color: "var(--adm-red)", bg: "var(--adm-red-bg)", icon: <AlertTriangle className="h-4 w-4" /> },
      cargando: { color: "var(--adm-text-muted)", bg: "var(--adm-surface-2)", icon: <span className="adm-spinner" /> },
    } as const;
    const s = map[estado.tipo];
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ color: s.color, background: s.bg, borderColor: s.color }}
      >
        {s.icon}
        <span>{estado.tipo === "ok" ? "✅ " : ""}{estado.texto}</span>
      </div>
    );
  })();

  return (
    <div className="adm-feature-card mb-6">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-start md:justify-between">
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
              Verifica que tus productos de <strong>stock local</strong> estén bien cargados en la
              Google Sheet. Si falta alguno o cambió de datos, lo agrega/corrige (sin tocar precios).
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={verificar}
            disabled={verificando || sincronizando}
            className="adm-btn adm-btn-ghost"
          >
            {verificando ? <span className="adm-spinner" /> : <ShieldCheck className="h-4 w-4" />}
            Verificar
          </button>
          <button
            onClick={sincronizar}
            disabled={sincronizando || verificando}
            className="adm-btn adm-btn-gold"
          >
            {sincronizando ? (
              <><span className="adm-spinner" /> Sincronizando…</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Sincronizar planilla</>
            )}
          </button>
        </div>
      </div>
      {banner}
    </div>
  );
}
