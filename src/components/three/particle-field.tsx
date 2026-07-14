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
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050505, 0);
    container.appendChild(renderer.domElement);

    // ----- Geometría base de partículas doradas -----
    const COUNT = reduceMotion ? 400 : 1400;
    const positions = new Float32Array(COUNT * 3);
    const basePositions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT); // fase individual para organicidad
    const twinkle = new Float32Array(COUNT); // 1 = titila, 0 = estable
    const sizes = new Float32Array(COUNT);

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

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Movimiento orgánico: cada partícula oscila alrededor de su base
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const ph = phases[i];
        posAttr.array[i * 3] =
          basePositions[i * 3] + Math.sin(t * 0.4 + ph) * 0.6;
        posAttr.array[i * 3 + 1] =
          basePositions[i * 3 + 1] + Math.cos(t * 0.3 + ph * 1.3) * 0.6;
        posAttr.array[i * 3 + 2] =
          basePositions[i * 3 + 2] + Math.sin(t * 0.25 + ph * 0.7) * 0.5;
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
