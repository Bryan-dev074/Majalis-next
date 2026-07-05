"use client";

import Image from "next/image";
import { Plus, Sparkles, Crown } from "lucide-react";
import { Perfume } from "@/types/database";
import { formatGs, precioEfectivo, concentracionDe } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";

/** Desde 1.000.000 Gs, el precio recibe tratamiento premium (oro vivo + halo + corona). */
const UMBRAL_PREMIUM = 1_000_000;

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
  const esPremium = precio >= UMBRAL_PREMIUM;

  return (
    <article
      data-reveal
      data-cursor="luxe"
      onClick={() => onAbrirDetalle(perfume)}
      className="glass-luxe group relative flex cursor-pointer flex-col overflow-hidden rounded-sm"
    >
      {/* Imagen — con placeholder premium si el perfume aún no tiene foto
          (Next/Image revienta con src vacío; varios productos recién agregados
          no tienen imagen todavía hasta que el scraper les consiga una). */}
      <div className="relative aspect-[3/4] overflow-hidden bg-coal">
        {perfume.url_imagen ? (
          <Image
            src={perfume.url_imagen}
            alt={perfume.nombre}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gold/[0.08] via-obsidian to-obsidian px-4 text-center">
            <span className="font-display text-3xl italic text-gold/40">M</span>
            <span className="line-clamp-2 font-display text-sm text-ivory/45">{perfume.nombre}</span>
            <span className="text-[0.5rem] uppercase tracking-imperial text-gold/40">Foto en camino</span>
          </div>
        )}

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

        {/* CTA al hover — centrado verticalmente en la imagen para no tapar
            el sello de oferta (arriba) */}
        {!agotado && (
          <div className="absolute inset-0 flex translate-y-2 items-center justify-center gap-3 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                agregar(perfume);
              }}
              className="btn-luxe flex items-center gap-2 !px-5 !py-2.5 !text-[0.65rem]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAbrirDetalle(perfume);
              }}
              className="btn-ghost-luxe !px-4 !py-2.5 !text-[0.65rem]"
            >
              Detalles
            </button>
          </div>
        )}
      </div>

      {/* Info — compacta en móvil (grid de 2 columnas), amplia en desktop */}
      <div className="flex flex-1 flex-col justify-between p-3 text-center sm:p-5">
        <div>
          <h3 className="font-display text-base leading-tight text-ivory sm:text-2xl">
            {perfume.nombre}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            <p className="text-[0.55rem] uppercase tracking-regal text-gold sm:text-[0.6rem]">
              {perfume.categoria[1] ?? perfume.categoria[0]}
            </p>
            {concentracionDe(perfume) && (
              <span className="rounded-full border border-gold/30 px-1.5 py-0.5 text-[0.45rem] font-bold uppercase tracking-regal text-gold-champagne sm:px-2 sm:text-[0.5rem]">
                {concentracionDe(perfume)}
              </span>
            )}
          </div>
        </div>

        {/* Precio — tratamiento elegante de oferta + PREMIUM (1M+) más notorio */}
        <div className="mt-3 flex flex-wrap items-end justify-center gap-1.5 sm:mt-5 sm:gap-3">
          {enOferta && (
            <span className="price-strike !text-xs text-ivory/50 sm:!text-sm">{formatGs(perfume.precio_regular)}</span>
          )}
          <span
            className={`font-display text-2xl font-semibold sm:text-3xl ${
              esPremium
                ? "precio-premium"
                : "text-gold-gradient drop-shadow-[0_0_14px_rgba(212,175,55,0.35)]"
            }`}
          >
            {formatGs(precio)}
          </span>
          {esPremium ? (
            <Crown className="premium-corona mb-1 h-3.5 w-3.5 text-gold-champagne sm:mb-1.5 sm:h-4 sm:w-4" strokeWidth={1.5} />
          ) : (
            enOferta && (
              <Sparkles className="mb-1 h-3 w-3 text-gold-light opacity-80 sm:mb-1.5 sm:h-4 sm:w-4" />
            )
          )}
        </div>
      </div>
    </article>
  );
}
