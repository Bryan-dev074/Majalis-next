"use client";

import { useEffect, useRef } from "react";

/** Cursor dorado: posición directa, sin resorte ni transición de movimiento. */
export function LiquidCursor() {
  const coreRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;

    let x = 0;
    let y = 0;
    let pressed = false;
    let interactive = false;
    const hide = () => {
      core.style.visibility = "hidden";
      halo.style.visibility = "hidden";
    };
    const draw = () => {
      core.style.transform = `translate3d(${x - 4}px, ${y - 4}px, 0)`;
      halo.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0) scale(${pressed ? 0.7 : interactive ? 1.45 : 1})`;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !finePointer.matches || reducedMotion.matches) {
        hide();
        return;
      }
      x = event.clientX;
      y = event.clientY;
      draw();
      core.style.visibility = "visible";
      halo.style.visibility = "visible";
    };
    const onOver = (event: PointerEvent) => {
      interactive = event.target instanceof Element && Boolean(event.target.closest(
        'a, button, [data-cursor="luxe"], input, select, textarea, [role="button"]'
      ));
      draw();
    };
    const onDown = () => { pressed = true; draw(); };
    const onUp = () => { pressed = false; draw(); };
    const onOut = (event: PointerEvent) => { if (!event.relatedTarget) hide(); };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    window.addEventListener("blur", hide);
    finePointer.addEventListener("change", hide);
    reducedMotion.addEventListener("change", hide);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", hide);
      finePointer.removeEventListener("change", hide);
      reducedMotion.removeEventListener("change", hide);
    };
  }, []);

  return (
    <>
      <div ref={haloRef} className="cursor-halo" aria-hidden="true" />
      <div ref={coreRef} className="cursor-core" aria-hidden="true" />
    </>
  );
}
