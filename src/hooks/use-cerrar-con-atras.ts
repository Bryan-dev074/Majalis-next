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
const pila: Array<() => void> = [];
let instalado = false;
let ignorarProximoPop = false;

function manejarPop() {
  // history.back() programático (cierre manual) → ignorar este pop, no cerrar nada.
  if (ignorarProximoPop) {
    ignorarProximoPop = false;
    return;
  }
  const cerrar = pila.pop();
  if (cerrar) cerrar();
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

    let cerradoPorPop = false;
    const cerrar = () => {
      cerradoPorPop = true;
      onCloseRef.current();
    };
    pila.push(cerrar);
    window.history.pushState({ majalisOverlay: true }, "");

    return () => {
      const i = pila.lastIndexOf(cerrar);
      if (i >= 0) pila.splice(i, 1);
      // Cierre MANUAL (X/ESC/backdrop): sacar la entrada que empujamos sin re-cerrar.
      if (!cerradoPorPop && window.history.state?.majalisOverlay) {
        ignorarProximoPop = true;
        window.history.back();
      }
    };
  }, [abierto]);
}
