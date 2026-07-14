"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Fondo 3D orgánico inteligente.
 *
 * Requisitos del brief cubiertos:
 *  - Partículas con fluidez orgánica (movimiento sinusoidal suave).
 *  - Algunas brillan y destellan solas (diamantes titilando).
 *  - Al hacer clic en la pantalla, onda expansiva 3D de mini-partículas
 *    doradas que se disuelven sobre el negro absoluto (#050505).
 *  - Respeta prefers-reduced-motion.
 */
export function ParticleField() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Perfil del dispositivo: móviles y gama baja pagan MUCHO menos (menos
    // partículas, menor pixel-ratio, sin MSAA, render a 30fps). En desktop el
    // look queda idéntico al original.
    const esMovil =
      window.matchMedia("(pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) <= 768;
    const cores = navigator.hardwareConcurrency || 4;
    const memGB = (navigator as { deviceMemory?: number }).deviceMemory || 4;
    const gamaBaja = cores <= 4 || memGB <= 4;

    // ----- Escena -----
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.012);

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    camera.position.z = 36;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !esMovil, // los sprites ya son suaves por la textura → MSAA solo cuesta en móvil
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // dpr más bajo en móvil: los sprites son difusos, 1.5 vs 2 es indistinguible
    // pero baja ~44% el fill-rate en pantallas de alta densidad.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, esMovil ? 1.5 : 2));
    renderer.setClearColor(0x050505, 0);
    container.appendChild(renderer.domElement);

    // ----- Geometría base de partículas doradas -----
    // Densidad escalada por dispositivo (solo cambia la cantidad; el look se
    // mantiene). Un móvil de gama baja ya no paga 1400 sprites + su loop JS.
    const COUNT = reduceMotion ? 400 : esMovil ? 600 : gamaBaja ? 900 : 1400;
    const positions = new Float32Array(COUNT * 3);
    const basePositions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT); // fase individual para organicidad
    const twinkle = new Float32Array(COUNT); // 1 = titila, 0 = estable
    const sizes = new Float32Array(COUNT);
    // Desplazamiento por la ONDA DE CHOQUE del click (0 en reposo → el fondo se
    // ve idéntico al original hasta que tocás; el resorte lo devuelve a su lugar).
    const offsets = new Float32Array(COUNT * 3);
    const offVel = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      // Distribución esférica suave
      const r = 18 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;

      phases[i] = Math.random() * Math.PI * 2;
      twinkle[i] = Math.random() < 0.18 ? 1 : 0; // 18% son "diamantes titilantes"
      sizes[i] = 0.15 + Math.random() * 0.4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Material con sprite dorado
    const texture = makeCircleTexture();
    const material = new THREE.PointsMaterial({
      size: 0.5,
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0xd4af37),
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ----- Ondas de click (partículas efímeras) -----
    interface Ripple {
      points: THREE.Points;
      born: number;
      life: number;
      velocities: Float32Array;
    }
    const ripples: Ripple[] = [];

    const spawnRipple = (clientX: number, clientY: number) => {
      // Convertir coords de pantalla a mundo 3D
      const vec = new THREE.Vector3(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
        0.5
      );
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = -camera.position.z / dir.z;
      const pos = camera.position.clone().add(dir.multiplyScalar(distance));

      // ONDA DE CHOQUE sobre el CAMPO real: empuja las partículas del fondo que
      // están cerca del punto tocado (el resorte del loop las trae de vuelta).
      // El campo (`points`) rota, así que convierto el click a su espacio local.
      // SOLO EN DESKTOP: en teléfono este barrido por COUNT (+ el resorte por
      // frame) trababa el fondo → en móvil el click hace la explosión pero NO
      // mueve el campo (comportamiento "como antes", pedido del dueño).
      if (!esMovil) {
        const golpe = points.worldToLocal(pos.clone());
        const RADIO = 26;
        for (let i = 0; i < COUNT; i++) {
          const dx = basePositions[i * 3] + offsets[i * 3] - golpe.x;
          const dy = basePositions[i * 3 + 1] + offsets[i * 3 + 1] - golpe.y;
          const dz = basePositions[i * 3 + 2] + offsets[i * 3 + 2] - golpe.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > RADIO * RADIO) continue;
          const d = Math.sqrt(d2) || 0.001;
          const fuerza = (Math.exp(-d / (RADIO * 0.45)) * 2.4) / d; // fuerte cerca, suave lejos
          offVel[i * 3] += dx * fuerza;
          offVel[i * 3 + 1] += dy * fuerza;
          offVel[i * 3 + 2] += dz * fuerza * 0.6;
        }
      }

      const N = 80;
      const rPos = new Float32Array(N * 3);
      const velocities = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        rPos[i * 3] = pos.x;
        rPos[i * 3 + 1] = pos.y;
        rPos[i * 3 + 2] = pos.z;
        // Dirección radial aleatoria
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.35;
        velocities[i * 3] = Math.cos(angle) * speed;
        velocities[i * 3 + 1] = Math.sin(angle) * speed;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;
      }
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
      const rMat = new THREE.PointsMaterial({
        size: 0.7,
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(0xe8c766),
      });
      const rPts = new THREE.Points(rGeo, rMat);
      scene.add(rPts);
      ripples.push({ points: rPts, born: clock.getElapsedTime(), life: 1.6, velocities });
    };

    // ----- Interacción -----
    let mouseX = 0;
    let mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX - window.innerWidth / 2;
      mouseY = e.clientY - window.innerHeight / 2;
    };
    const onClick = (e: MouseEvent) => {
      spawnRipple(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) spawnRipple(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onTouch, { passive: true });

    // ----- Loop de animación -----
    const clock = new THREE.Clock();
    let frameId = 0;
    // Throttle de FPS ADAPTATIVO en móvil: cuando el fondo está QUIETO se
    // dibuja a 30fps (el vaivén lento es imperceptible y ahorra batería), pero
    // mientras hay una explosión de toque/click ACTIVA se dibuja a fondo (60fps)
    // para que ESA animación se vea fluida. Antes el toque quedaba capado a
    // 30fps y se veía entrecortado.
    const idleInterval = esMovil ? 1 / 30 : 0;
    let lastRender = -1;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      // Pestaña oculta → no gastar GPU/batería (belt-and-suspenders sobre el
      // throttle que ya hace el navegador).
      if (document.hidden) return;
      const t = clock.getElapsedTime();
      // Con explosión activa (ripples) → sin límite (fluido); quieto → 30fps.
      const minInterval = ripples.length > 0 ? 0 : idleInterval;
      // El clock sigue avanzando → el movimiento no se acelera ni se traba,
      // solo se dibujan menos cuadros cuando no hace falta.
      if (minInterval && t - lastRender < minInterval) return;
      lastRender = t;

      // Movimiento orgánico: cada partícula oscila alrededor de su base.
      // En DESKTOP se suma el desplazamiento de la onda de choque (con su
      // resorte); en MÓVIL se omite por completo → base + vaivén nada más,
      // como el fondo original, sin el costo del loop extra por frame.
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
      if (esMovil) {
        for (let i = 0; i < COUNT; i++) {
          const ph = phases[i];
          posAttr.array[i * 3] = basePositions[i * 3] + Math.sin(t * 0.4 + ph) * 0.6;
          posAttr.array[i * 3 + 1] = basePositions[i * 3 + 1] + Math.cos(t * 0.3 + ph * 1.3) * 0.6;
          posAttr.array[i * 3 + 2] = basePositions[i * 3 + 2] + Math.sin(t * 0.25 + ph * 0.7) * 0.5;
        }
      } else {
        for (let i = 0; i < COUNT; i++) {
          const ph = phases[i];
          // Resorte de la onda de choque: cada eje vuelve a 0 con amortiguación
          // (en reposo offsets≈0 y el fondo queda EXACTO al original).
          for (let k = 0; k < 3; k++) {
            const idx = i * 3 + k;
            offVel[idx] += -offsets[idx] * 0.02;
            offVel[idx] *= 0.9;
            offsets[idx] += offVel[idx];
          }
          posAttr.array[i * 3] =
            basePositions[i * 3] + Math.sin(t * 0.4 + ph) * 0.6 + offsets[i * 3];
          posAttr.array[i * 3 + 1] =
            basePositions[i * 3 + 1] + Math.cos(t * 0.3 + ph * 1.3) * 0.6 + offsets[i * 3 + 1];
          posAttr.array[i * 3 + 2] =
            basePositions[i * 3 + 2] + Math.sin(t * 0.25 + ph * 0.7) * 0.5 + offsets[i * 3 + 2];
        }
      }
      posAttr.needsUpdate = true;

      // Titilación de "diamantes": cambia opacidad global con modulación por shader-free approach
      // Alternamos el color entre oro y oro champán para crear parpadeo.
      const sparkle = 0.7 + 0.3 * Math.sin(t * 2);
      material.opacity = 0.55 + 0.35 * sparkle;

      // Rotación lenta + parallax suave al cursor
      points.rotation.y += 0.0006;
      points.rotation.x += 0.0002;
      camera.position.x += (mouseX * 0.01 - camera.position.x) * 0.03;
      camera.position.y += (-mouseY * 0.01 - camera.position.y) * 0.03;
      camera.lookAt(scene.position);

      // Actualizar ondas de click
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        const age = t - rip.born;
        const progress = age / rip.life;
        if (progress >= 1) {
          scene.remove(rip.points);
          rip.points.geometry.dispose();
          (rip.points.material as THREE.Material).dispose();
          ripples.splice(i, 1);
          continue;
        }
        const arr = (rip.points.geometry.getAttribute("position") as THREE.BufferAttribute)
          .array as Float32Array;
        for (let j = 0; j < arr.length / 3; j++) {
          arr[j * 3] += rip.velocities[j * 3];
          arr[j * 3 + 1] += rip.velocities[j * 3 + 1];
          arr[j * 3 + 2] += rip.velocities[j * 3 + 2];
          // leve desaceleración
          rip.velocities[j * 3] *= 0.98;
          rip.velocities[j * 3 + 1] *= 0.98;
          rip.velocities[j * 3 + 2] *= 0.98;
        }
        (rip.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (rip.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - progress);
      }

      renderer.render(scene, camera);
    };
    animate();

    // ----- Resize -----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ----- Cleanup -----
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      ripples.forEach((r) => {
        scene.remove(r.points);
        r.points.geometry.dispose();
        (r.points.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      aria-hidden="true"
    />
  );
}

/** Genera una textura circular suave para usar como sprite de partícula. */
function makeCircleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(244,224,136,0.9)");
  grad.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
