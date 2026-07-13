"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Fondo 3D de polvo dorado — versión PREMIUM INTERACTIVA (13-jul-2026).
 *
 *  - CALIDAD: shader propio con tamaño y TITILEO POR PARTÍCULA (antes el
 *    parpadeo era global y el atributo de tamaño ni se usaba), sprite de
 *    128px y tamaño consciente del devicePixelRatio → puntos nítidos.
 *  - CLICK = ONDA DE CHOQUE en el CAMPO REAL: el impulso empuja las
 *    partículas del fondo (resorte con amortiguación las trae de vuelta),
 *    además de un pequeño destello efímero en el punto tocado.
 *  - CURSOR: parallax de cámara + repulsión suave alrededor del puntero.
 *  - RENDIMIENTO: el vaivén orgánico vive en el VERTEX SHADER (CPU idle ≈ 0:
 *    el buffer solo se re-sube mientras la física del click tiene energía),
 *    rAF pausado con la pestaña oculta, cantidad según viewport y
 *    prefers-reduced-motion = campo estático sin loop.
 */
export function ParticleField() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ----- Escena -----
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.012);

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.z = 36;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false, // los sprites aditivos no lo necesitan → GPU más liviana
      powerPreference: "high-performance",
    });
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x050505, 0);
    container.appendChild(renderer.domElement);

    // ----- Partículas: cantidad según pantalla (celulares no pagan de más) -----
    const area = window.innerWidth * window.innerHeight;
    const COUNT = reduceMotion ? 350 : Math.max(350, Math.min(1600, Math.round(area / 900)));

    const positions = new Float32Array(COUNT * 3); // posición BASE (el vaivén va en GPU)
    const offsets = new Float32Array(COUNT * 3); // desplazamiento físico (click/cursor)
    const velocities = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    const twinkles = new Float32Array(COUNT); // 0 = estable · >0 = velocidad de titileo propia
    const sizes = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const r = 18 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
      twinkles[i] = Math.random() < 0.22 ? 0.8 + Math.random() * 2.2 : 0;
      sizes[i] = 0.5 + Math.random() * 1.3; // ahora SÍ se usa (shader propio)
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const offsetAttr = new THREE.BufferAttribute(offsets, 3);
    offsetAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aOffset", offsetAttr);
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const texture = makeCircleTexture();
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: texture },
        uColor: { value: new THREE.Color(0xd8b25a) },
        uPixelRatio: { value: DPR },
        uAmp: { value: reduceMotion ? 0 : 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute float aPhase;
        attribute float aTwinkle;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uAmp;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          // vaivén orgánico EN GPU (antes era un bucle JS por frame)
          p.x += sin(uTime * 0.4 + aPhase) * 0.6 * uAmp;
          p.y += cos(uTime * 0.3 + aPhase * 1.3) * 0.6 * uAmp;
          p.z += sin(uTime * 0.25 + aPhase * 0.7) * 0.5 * uAmp;
          p += aOffset;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // titileo INDIVIDUAL: cada diamante con su ritmo; el resto, firme
          vAlpha = aTwinkle > 0.0
            ? 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * aTwinkle * 2.2 + aPhase * 7.0))
            : 0.8;
          gl_PointSize = aSize * uPixelRatio * (520.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(uColor, 1.0) * tex * vAlpha;
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ----- Física del campo (click + cursor): resorte con amortiguación -----
    let energia = 0; // mientras > umbral, se integra y re-sube el buffer
    const impulsoLocal = new THREE.Vector3();

    /** Onda de choque: empuja el CAMPO desde el punto dado (espacio mundo → local). */
    const empujarCampo = (mundo: THREE.Vector3, fuerza: number, radio: number) => {
      impulsoLocal.copy(mundo);
      points.worldToLocal(impulsoLocal);
      for (let i = 0; i < COUNT; i++) {
        const dx = positions[i * 3] + offsets[i * 3] - impulsoLocal.x;
        const dy = positions[i * 3 + 1] + offsets[i * 3 + 1] - impulsoLocal.y;
        const dz = positions[i * 3 + 2] + offsets[i * 3 + 2] - impulsoLocal.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > radio * radio) continue;
        const d = Math.sqrt(d2) || 0.001;
        const caida = Math.exp(-d / (radio * 0.45)); // fuerte cerca, suave lejos
        const k = (fuerza * caida) / d;
        velocities[i * 3] += dx * k;
        velocities[i * 3 + 1] += dy * k;
        velocities[i * 3 + 2] += dz * k * 0.6;
      }
      energia = 1;
    };

    /** Punto del mundo bajo unas coordenadas de pantalla (plano z=0). */
    const puntoMundo = (clientX: number, clientY: number) => {
      const vec = new THREE.Vector3(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1,
        0.5
      );
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = -camera.position.z / dir.z;
      return camera.position.clone().add(dir.multiplyScalar(distance));
    };

    // ----- Destello efímero del click (chico: el protagonista es la onda) -----
    interface Chispa {
      points: THREE.Points;
      born: number;
      life: number;
      velocities: Float32Array;
      material: THREE.PointsMaterial;
    }
    const chispas: Chispa[] = [];
    const spawnChispa = (pos: THREE.Vector3) => {
      const N = 42;
      const rPos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        rPos[i * 3] = pos.x;
        rPos[i * 3 + 1] = pos.y;
        rPos[i * 3 + 2] = pos.z;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.3;
        vel[i * 3] = Math.cos(angle) * speed;
        vel[i * 3 + 1] = Math.sin(angle) * speed;
        vel[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;
      }
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
      const rMat = new THREE.PointsMaterial({
        size: 0.6,
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(0xe8c766),
      });
      const rPts = new THREE.Points(rGeo, rMat);
      scene.add(rPts);
      chispas.push({ points: rPts, born: clock.getElapsedTime(), life: 1.2, velocities: vel, material: rMat });
    };

    // ----- Interacción -----
    let mouseX = 0;
    let mouseY = 0;
    let cursorActivo = 0; // frames restantes de influencia del cursor
    const ultimoCursor = new THREE.Vector2();
    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX - window.innerWidth / 2;
      mouseY = e.clientY - window.innerHeight / 2;
      cursorActivo = 30;
      ultimoCursor.set(e.clientX, e.clientY);
    };
    const onPointerDown = (clientX: number, clientY: number) => {
      const pos = puntoMundo(clientX, clientY);
      empujarCampo(pos, 2.6, 26); // la ONDA por el campo real (lo pedido)
      spawnChispa(pos);
    };
    const onClick = (e: MouseEvent) => onPointerDown(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    };

    if (!reduceMotion) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("click", onClick);
      window.addEventListener("touchstart", onTouch, { passive: true });
    }

    // ----- Loop -----
    const clock = new THREE.Clock();
    let frameId = 0;
    let corriendo = false;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;

      // Repulsión SUAVE alrededor del cursor (solo mientras se mueve)
      if (cursorActivo > 0) {
        cursorActivo--;
        const pos = puntoMundo(ultimoCursor.x, ultimoCursor.y);
        empujarCampo(pos, 0.05, 9);
      }

      // Física del campo: integrar SOLO mientras hay energía (idle = 0 CPU acá)
      if (energia > 0.0004) {
        let e = 0;
        for (let i = 0; i < COUNT * 3; i++) {
          velocities[i] += -offsets[i] * 0.02; // resorte a la base
          velocities[i] *= 0.9; // amortiguación
          offsets[i] += velocities[i];
          e += velocities[i] * velocities[i];
        }
        energia = e / COUNT;
        offsetAttr.needsUpdate = true;
      }

      // Rotación lenta + parallax
      points.rotation.y += 0.0006;
      points.rotation.x += 0.0002;
      camera.position.x += (mouseX * 0.01 - camera.position.x) * 0.03;
      camera.position.y += (-mouseY * 0.01 - camera.position.y) * 0.03;
      camera.lookAt(scene.position);

      // Chispas efímeras
      for (let i = chispas.length - 1; i >= 0; i--) {
        const ch = chispas[i];
        const progress = (t - ch.born) / ch.life;
        if (progress >= 1) {
          scene.remove(ch.points);
          ch.points.geometry.dispose();
          ch.material.dispose();
          chispas.splice(i, 1);
          continue;
        }
        const arr = (ch.points.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
        for (let j = 0; j < arr.length; j++) {
          arr[j] += ch.velocities[j];
          ch.velocities[j] *= 0.97;
        }
        (ch.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        ch.material.opacity = Math.max(0, 1 - progress);
      }

      renderer.render(scene, camera);
    };

    const arrancar = () => {
      if (!corriendo && !reduceMotion) {
        corriendo = true;
        clock.start();
        animate();
      }
    };
    const frenar = () => {
      if (corriendo) {
        corriendo = false;
        cancelAnimationFrame(frameId);
        clock.stop();
      }
    };
    // Pestaña oculta → ni un frame (batería y CPU).
    const onVisibility = () => (document.hidden ? frenar() : arrancar());
    document.addEventListener("visibilitychange", onVisibility);

    if (reduceMotion) {
      renderer.render(scene, camera); // campo estático, un solo frame
    } else {
      arrancar();
    }

    // ----- Resize -----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ----- Cleanup -----
    return () => {
      frenar();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      chispas.forEach((ch) => {
        scene.remove(ch.points);
        ch.points.geometry.dispose();
        ch.material.dispose();
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

/** Sprite circular dorado de 128px (nítido en pantallas retina). */
function makeCircleTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(248,230,160,0.95)");
  grad.addColorStop(0.6, "rgba(216,178,90,0.35)");
  grad.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
