"use client";

import Image from "next/image";
import { useState } from "react";
import { fotoCard } from "@/lib/foto";

interface FotoProductoProps {
  src: string;
  alt: string;
  /** "card" (default) = variante 480w pre-generada · "original" = foto completa (modal). */
  variante?: "card" | "original";
  sizes?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Foto de producto SIN el optimizador de Vercel (`unoptimized`): las variantes de
 * tarjeta ya vienen pre-generadas del pipeline (480w webp en Storage, ver
 * src/lib/foto.ts) → cero transformaciones contra la cuota. Si la variante aún no
 * existe (foto recién scrapeada, backfill pendiente), onError cae al original.
 */
export function FotoProducto({ src, alt, variante = "card", sizes, className, priority }: FotoProductoProps) {
  const [caida, setCaida] = useState(false);
  const url = variante === "card" && !caida ? fotoCard(src) : src;
  return (
    <Image
      src={url}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => { if (url !== src) setCaida(true); }}
    />
  );
}
