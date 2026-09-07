"use client";

import { useEffect, useRef } from "react";

/**
 * useCerrarConAtras — hace que el botón "ATRÁS" del teléfono (o del navegador en PC)
 * CIERRE el overlay abierto (modal de perfume, carrito, checkout, menú móvil) en vez
 * de navegar fuera de la página o cerrar la app.
 *
 * Cómo: al abrir se empuja un estado al historial; "atrás" lo saca → popstate → cierra.
 * Si se cierra con la X/ESC/backdrop, se consume ese estado con history.back() para que
 * el PRÓXIMO "atrás" del usuario navegue normal.
 *
 * ANIDACIÓN (checkout sobre carrito): una PILA global + UN solo listener de popstate
 * garantizan que "atrás" cierre SOLO el overlay de más arriba (no todos a la vez).
 */
interface Overlay {
  id: string;
  cerrar: () => void;
  enHistorial: boolean;
}

const pila: Overlay[] = [];
const idsGestionados = new Set<string>();
let siguienteId = 0;
let instalado = false;
let esperandoRetroceso = false;
let sincronizacionPendiente = false;
let overflowAnterior: string | null = null;

function sincronizar() {
  sincronizacionPendiente = false;
  // El lock pertenece a la pila completa. Pasar de ficha a carrito no suelta
  // el scroll y cerrar checkout conserva el lock del carrito que sigue abierto.
  if (pila.length > 0 && overflowAnterior === null) {
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else if (pila.length === 0 && overflowAnterior !== null) {
    document.body.style.overflow = overflowAnterior;
    overflowAnterior = null;
  }

  if (esperandoRetroceso) return;
  const idActual = window.history.state?.majalisOverlay;
  if (idsGestionados.has(idActual) && !pila.some((overlay) => overlay.id === idActual)) {
    // history.back es asíncrono. Esperar su popstate antes de insertar el
    // carrito evita que el retroceso de la ficha consuma la entrada nueva.
    esperandoRetroceso = true;
    window.history.back();
    return;
  }
  for (const overlay of pila) {
    if (overlay.enHistorial) continue;
    window.history.pushState({ ...window.history.state, majalisOverlay: overlay.id }, "");
    overlay.enHistorial = true;
    idsGestionados.add(overlay.id);
  }
}

function programarSincronizacion() {
  if (sincronizacionPendiente) return;
  sincronizacionPendiente = true;
  queueMicrotask(sincronizar);
}

function manejarPop() {
  if (esperandoRetroceso) {
    esperandoRetroceso = false;
    programarSincronizacion();
    return;
  }
  const idActual = window.history.state?.majalisOverlay;
  // También respeta saltos de varias entradas desde el menú Atrás.
  while (pila.length > 0) {
    const superior = pila[pila.length - 1];
    if (!superior.enHistorial || superior.id === idActual) break;
    pila.pop();
    superior.cerrar();
  }
  programarSincronizacion();
}

export function useCerrarConAtras(abierto: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!abierto) return;
    if (!instalado) {
      window.addEventListener("popstate", manejarPop);
      instalado = true;
    }

    const overlay: Overlay = {
      id: `majalis-${++siguienteId}`,
      cerrar: () => onCloseRef.current(),
      enHistorial: false,
    };
    pila.push(overlay);
    programarSincronizacion();

    return () => {
      const i = pila.indexOf(overlay);
      if (i >= 0) pila.splice(i, 1);
      programarSincronizacion();
    };
  }, [abierto]);
}
