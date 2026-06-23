"use client";

import Image from "next/image";
import { Plus, Sparkles, Zap } from "lucide-react";
import { Perfume } from "@/types/database";
import { formatGs, precioEfectivo, esExterno } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";

interface ProductCardProps {
  perfume: Perfume;
  onAbrirDetalle: (p: Perfume) => void;
}

/**
 * Tarjeta de producto del catálogo.
 *
 * Tratamiento de marca:
 *  - Precio de descuento: el original aparece tachado con una línea fina
 *    elegante (price-strike) + micro-sello dorado minimalista del %.
 *  - Stock agotado: botón pasa a estado sofisticado "Agotado", deshabilitado.
 *  - Hover: la imagen se eleva y aparece un velo dorado + CTA.
 */
export function ProductCard({ perfume, onAbrirDetalle }: ProductCardProps) {
  const { agregar } = useCart();
  const agotado = perfume.stock_disponible <= 0;
  const enOferta = perfume.en_oferta && perfume.precio_descuento != null;
  const precio = precioEfectivo(perfume);

  return (
    <article
      data-reveal
      data-cursor="luxe"
      onClick={() => onAbrirDetalle(perfume)}
      className="glass-luxe group relative flex cursor-pointer flex-col overflow-hidden rounded-sm"
    >
      {/* Imagen */}
      <div className="relative aspect-[3/4] overflow-hidden bg-coal">
        <Image
          src={perfume.url_imagen}
          alt={perfume.nombre}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
        />

        {/* Velo al hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/20 to-transparent opacity-90 transition-opacity duration-500" />

        {/* Velo dorado que aparece en hover */}
        <div className="pointer-events-none absolute inset-0 bg-gold/0 transition-all duration-500 group-hover:bg-gold/5" />

        {/* Marca arriba derecha */}
        <div className="absolute right-3 top-3 border border-gold/20 bg-obsidian/70 px-2.5 py-1 text-[0.55rem] uppercase tracking-regal text-ivory/80 backdrop-blur-sm">
          {perfume.marca}
        </div>

        {/* Sello de oferta — micro-sello dorado minimalista animado */}
        {enOferta && (
          <div className="absolute left-3 top-3" title={`${perfume.porcentaje_descuento}% de descuento`}>
            <div className="seal-offer">
              <span className="flex flex-col items-center leading-none">
                <span className="font-semibold text-[0.7rem]">
                  {perfume.porcentaje_descuento}%
                </span>
                <span className="text-[0.45rem] tracking-widest">OFF</span>
              </span>
            </div>
          </div>
        )}

        {/* Estado "Agotado" — velo discreto */}
        {agotado && (
          <div className="absolute inset-0 flex items-center justify-center bg-obsidian/55 backdrop-blur-[2px]">
            <span className="border border-ivory/15 bg-obsidian/40 px-5 py-2 text-[0.6rem] uppercase tracking-imperial text-ivory/70">
              Edición reservada
            </span>
          </div>
        )}

        {/* Badge "⚡ Envío Inmediato" — solo stock local (es_dropi=false) */}
        {!esExterno(perfume) && !agotado && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-[#25D366]/40 bg-obsidian/80 px-2.5 py-1 text-[0.5rem] font-bold uppercase tracking-regal text-[#25D366] backdrop-blur-sm">
            <Zap className="h-2.5 w-2.5" fill="currentColor" />
            Envío Inmediato
          </div>
        )}

        {/* CTA al hover — solo si hay stock */}
        {!agotado && (
          <div className="absolute inset-x-0 bottom-0 flex translate-y-4 items-center justify-center gap-3 p-4 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                agregar(perfume);
              }}
              className="btn-luxe flex items-center gap-2 !px-5 !py-2.5 !text-[0.6rem]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAbrirDetalle(perfume);
              }}
              className="btn-ghost-luxe !px-4 !py-2.5 !text-[0.6rem]"
            >
              Detalles
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between p-5 text-center">
        <div>
          <h3 className="font-display text-xl leading-tight text-ivory">
            {perfume.nombre}
          </h3>
          <p className="mt-1 text-[0.55rem] uppercase tracking-regal text-gold/70">
            {perfume.categoria[1] ?? perfume.categoria[0]}
          </p>
        </div>

        {/* Precio — tratamiento elegante de oferta */}
        <div className="mt-4 flex items-end justify-center gap-3">
          {enOferta && (
            <span className="price-strike">{formatGs(perfume.precio_regular)}</span>
          )}
          <span className="font-display text-2xl text-gold-gradient">
            {formatGs(precio)}
          </span>
          {enOferta && (
            <Sparkles className="mb-1 h-3.5 w-3.5 text-gold-light opacity-70" />
          )}
        </div>
      </div>
    </article>
  );
}
