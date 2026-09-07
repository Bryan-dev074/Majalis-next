"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Datos de entrega del cliente.
 * Se persisten en localStorage para que no tenga que volver a rellenar
 * cada vez que entra o hace un nuevo pedido.
 */
export interface DeliveryProfileData {
  whatsapp: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  indicaciones: string;
}

const STORAGE_KEY = "sultan-profile-v1";

const VACIO: DeliveryProfileData = {
  whatsapp: "",
  nombre: "",
  ciudad: "",
  direccion: "",
  indicaciones: "",
};

/**
 * Lee el perfil guardado (safe para SSR: devuelve vacío en el primer render).
 */
function leerPerfil(): DeliveryProfileData {
  if (typeof window === "undefined") return VACIO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return VACIO;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return VACIO;
    const datos = parsed as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(VACIO).map((key) => [key, typeof datos[key] === "string" ? datos[key] : ""])
    ) as unknown as DeliveryProfileData;
  } catch {
    return VACIO;
  }
}

/**
 * Hook de perfil de delivery persistente.
 * - `perfil`: estado actual (se hidrata desde localStorage en el primer effect).
 * - `actualizar`: guarda cambios (parciales) en estado + storage.
 * - `listo`: false hasta terminar la hidratación (evita pisar valores guardados).
 */
export function useDeliveryProfile() {
  const [perfil, setPerfil] = useState<DeliveryProfileData>(VACIO);
  const [listo, setListo] = useState(false);

  // Hidratar al montar
  useEffect(() => {
    setPerfil(leerPerfil());
    setListo(true);
  }, []);

  const actualizar = useCallback((parcial: Partial<DeliveryProfileData>) => {
    setPerfil((prev) => ({ ...prev, ...parcial }));
  }, []);

  useEffect(() => {
    if (!listo) return;
    const guardar = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(perfil));
      } catch {
        /* storage inaccesible o lleno */
      }
    };
    const pendiente = window.setTimeout(guardar, 250);
    window.addEventListener("pagehide", guardar);
    return () => {
      window.clearTimeout(pendiente);
      window.removeEventListener("pagehide", guardar);
    };
  }, [listo, perfil]);

  return { perfil, actualizar, listo };
}
