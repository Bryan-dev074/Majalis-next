"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Perfume } from "@/types/database";

interface CatalogContextValue {
  /** Lista completa de perfumes del catálogo (solo activos / no ocultos). */
  perfumes: Perfume[];
  /** Perfume seleccionado para el modal de detalle (null = cerrado). */
  detalle: Perfume | null;
  /** Establece / cierra el modal de detalle. */
  abrirDetalle: (p: Perfume | null) => void;
  /** Refresca el catálogo (útil tras cambios en /admin). */
  recargar: () => void;
  /** Si ya terminó de cargar el catálogo desde el server. */
  cargado: boolean;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Claves compartidas con el panel /admin (modo local)
const OCULTOS_KEY = "sultan-admin-ocultos";
const DESTACADOS_KEY = "sultan-admin-destacados";

function leerSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Provee el catálogo y el perfume seleccionado a toda la app.
 *
 * - Carga los perfumes desde `/api/catalogo` al montar (con fallback local).
 * - En modo local (sin Supabase service role), respeta los perfumes que el
 *   administrador ocultó/destacó desde /admin (guardados en localStorage).
 * - Permite refrescar tras ediciones (`sultan:catalogo-cambio`).
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  // Arrancamos vacío: el catálogo real llega de /api/catalogo. Antes
  // arrancaba con FALLBACK_PERFUMES y, si la base venía vacía, esos 11 demos
  // hardcodeados quedaban en pantalla como "fantasmas" imposibles de ocultar.
  const [perfumesBase, setPerfumesBase] = useState<Perfume[]>([]);
  const [detalle, setDetalle] = useState<Perfume | null>(null);
  const [cargado, setCargado] = useState(false);
  const [token, setToken] = useState(0);
  const [, setTickLocal] = useState(0); // fuerza re-render al cambiar localStorage

  const recargar = useCallback(() => {
    setToken((t) => t + 1);
    setTickLocal((t) => t + 1);
  }, []);

  // Carga inicial + refrescos desde el server
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/catalogo", { cache: "no-store" });
        if (!res.ok) {
          setCargado(true);
          return;
        }
        const data = (await res.json()) as Perfume[];
        // Respetamos la respuesta del servidor aunque sea vacía: si el
        // catálogo quedó sin productos activos, la tienda debe verse vacía,
        // NO con el seed de respaldo (esos demos no se gestionan desde /admin).
        if (!cancelado && Array.isArray(data)) {
          setPerfumesBase(data);
        }
      } catch {
        /* mantenemos el fallback */
      } finally {
        if (!cancelado) setCargado(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Escuchar cambios desde /admin (mismo navegador)
  useEffect(() => {
    const onCambio = () => recargar();
    window.addEventListener("sultan:catalogo-cambio", onCambio);
    // También escuchar cambios directos de storage (otras pestañas)
    const onStorage = (e: StorageEvent) => {
      if (e.key === OCULTOS_KEY || e.key === DESTACADOS_KEY) recargar();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("sultan:catalogo-cambio", onCambio);
      window.removeEventListener("storage", onStorage);
    };
  }, [recargar]);

  // Aplicar overrides locales (modo sin service role)
  const perfumes = useMemo(() => {
    const ocultos = leerSet(OCULTOS_KEY);
    const destacados = leerSet(DESTACADOS_KEY);
    return perfumesBase
      .filter((p) => p.activo !== false && !ocultos.has(p.id))
      .map((p) => (destacados.has(p.id) ? { ...p, destacado: true } : p));
    // leerSet + tick via recargar; eslint-disable por dependencia intencional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfumesBase, token]);

  const abrirDetalle = useCallback((p: Perfume | null) => setDetalle(p), []);

  const value = useMemo(
    () => ({ perfumes, detalle, abrirDetalle, recargar, cargado }),
    [perfumes, detalle, abrirDetalle, recargar, cargado]
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog debe usarse dentro de <CatalogProvider>");
  }
  return ctx;
}
