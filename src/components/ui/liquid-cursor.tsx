"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor premium con físicas líquidas.
 *
 * Dos elementos:
 *  - núcleo dorado sólido que sigue el puntero con un retardo mínimo.
 *  - halo líquido que persigue con interpolación (lerp), generando la
 *    sensación de "goma/elástico" propia de interfaces de lujo.
 *
 * Se agranda al pasar sobre elementos interactivos ([data-cursor="luxe"]
 * o a/button). Respeta reduced-motion y se desactiva en pantallas táctiles.
 */
export function LiquidCursor() {
  const coreRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // No activar en dispositivos sin puntero fino
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let haloX = mouseX;
    let haloY = mouseY;
    let scale = 1;
    let targetScale = 1;
    let frame = 0;
    let running = false;
    let pressed = false;
    let lastHit = 0;

    const lerp = reduceMotion ? 1 : 0.18;
    const scaleStep = reduceMotion ? 1 : 0.15;

    const asentado = () =>
      Math.abs(mouseX - haloX) < 0.1 &&
      Math.abs(mouseY - haloY) < 0.1 &&
      Math.abs(targetScale - scale) < 0.01;

    const loop = (t: number) => {
      // Hit-test throttled a ~9 Hz FUERA del mousemove (que dispara 60-120/s y
      // forzaba un recálculo de layout sincrónico en cada evento).
      if (t - lastHit > 110) {
        lastHit = t;
        const el = document.elementFromPoint(mouseX, mouseY);
        const interactive = el?.closest(
          'a, button, [data-cursor="luxe"], input, [role="button"]'
        );
        targetScale = pressed ? 0.7 : interactive ? 2.1 : 1;
      }
      haloX += (mouseX - haloX) * lerp;
      haloY += (mouseY - haloY) * lerp;
      scale += (targetScale - scale) * scaleStep;
      halo.style.transform = `translate(${haloX - 20}px, ${haloY - 20}px) scale(${scale})`;
      // Descansar cuando todo quedó quieto: no seguir pidiendo rAF eternamente
      // (antes corría 60fps para siempre aunque el mouse estuviera parado).
      if (asentado()) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    const arrancar = () => {
      if (!running) {
        running = true;
        frame = requestAnimationFrame(loop);
      }
    };

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      // El núcleo sigue casi instantáneamente (una sola escritura de transform).
      core.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;
      arrancar();
    };
    const onDown = () => {
      pressed = true;
      targetScale = 0.7;
      arrancar();
    };
    const onUp = () => {
      pressed = false;
      arrancar();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <>
      <div ref={haloRef} className="cursor-halo" aria-hidden="true" />
      <div ref={coreRef} className="cursor-core" aria-hidden="true" />
    </>
  );
}
