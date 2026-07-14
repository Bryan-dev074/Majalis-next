"use client";

import { useRef } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Perfume } from "@/types/database";
import { formatGs, precioEfectivo } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";

interface FavoritosProps {
  perfumes: Perfume[];
  onAbrirDetalle: (p: Perfume) => void;
}

/**
 * Carrusel horizontal de "Favoritos del Sultán" (destacados).
 */
export function Favoritos({ perfumes, onAbrirDetalle }: FavoritosProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { agregar } = useCart();

  const scroll = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <section id="favoritos" className="relative z-10 py-24 md:py-28">
      <div className="mx-auto mb-10 flex max-w-7xl items-end justify-between px-6 md:px-10">
        <div>
          <p className="eyebrow">Selección del Sultán</p>
          <h2 className="mt-3 font-display text-3xl text-ivory md:text-4xl">
            Favoritos del momento
          </h2>
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            onClick={() => scroll(-360)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-ivory/70 transition-all hover:border-gold hover:text-gold-champagne"
            aria-label="Anterior"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.25} />
          </button>
          <button
            onClick={() => scroll(360)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-ivory/70 transition-all hover:border-gold hover:text-gold-champagne"
            aria-label="Siguiente"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="hide-scrollbar mask-fade-r flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 md:px-10"
      >
        {perfumes.map((p) => {
          const precio = precioEfectivo(p);
          const agotado = p.stock_disponible <= 0;
          return (
            <article
              key={p.id}
              data-cursor="luxe"
              onClick={() => onAbrirDetalle(p)}
              className="glass-luxe group relative flex min-w-[280px] flex-1 cursor-pointer snap-center flex-col overflow-hidden rounded-sm md:min-w-[340px]"
            >
              <div className="relative h-[420px] overflow-hidden bg-coal">
                {/* Guarda contra src vacío: next/image crashea con "" (destacado
                    recién agregado sin foto todavía). Placeholder como en las tarjetas. */}
                {p.url_imagen ? (
                  <Image
                    src={p.url_imagen}
                    alt={p.nombre}
                    fill
                    sizes="(max-width: 768px) 280px, 340px"
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gold/[0.08] via-obsidian to-obsidian px-4 text-center">
                    <span className="font-display text-3xl italic text-gold/40">M</span>
                    <span className="line-clamp-2 font-display text-sm text-ivory/45">{p.nombre}</span>
                    <span className="text-[0.5rem] uppercase tracking-imperial text-gold/40">Foto en camino</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/30 to-transparent" />

                {/* Etiqueta best seller */}
                <div className="absolute left-4 top-4 border border-gold/25 bg-obsidian/60 px-2.5 py-1 text-[0.55rem] uppercase tracking-regal text-gold-champagne backdrop-blur-sm">
                  Best Seller
                </div>

                {/* CTA agregar */}
                {!agotado && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      agregar(p);
                    }}
                    className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ivory text-obsidian transition-all hover:bg-gold hover:text-obsidian hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.8)]"
                    aria-label="Agregar al carrito"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}

                {/* Info inferior */}
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[0.55rem] uppercase tracking-regal text-gold/70">
                    {p.marca}
                  </p>
                  <h3 className="mt-1 font-display text-2xl text-ivory">
                    {p.nombre}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-xs text-ivory/45">
                    {p.descripcion}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    {p.en_oferta && p.precio_descuento != null && (
                      <span className="price-strike">
                        {formatGs(p.precio_regular)}
                      </span>
                    )}
                    <span className="font-display text-xl text-gold-gradient">
                      {formatGs(precio)}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
