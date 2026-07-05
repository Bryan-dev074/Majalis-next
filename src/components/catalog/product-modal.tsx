"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { X, Plus, Minus, MessageCircle, Bell, Sparkles } from "lucide-react";
import { Perfume } from "@/types/database";
import { formatGs, precioEfectivo, buildWhatsAppUrl, concentracionDe } from "@/lib/format";
import { WHATSAPP_NUMBER } from "@/data/site-config";
import { useCart } from "@/hooks/use-cart";
import { NoteIcon } from "./note-icon";

interface ProductModalProps {
  perfume: Perfume | null;
  onClose: () => void;
}

type Capa = keyof Perfume["notas_olfativas"];
const CAPAS: { key: Capa; label: string; descripcion: string }[] = [
  { key: "salida", label: "Salida", descripcion: "Las primeras impresiones, efímeras y luminosas." },
  { key: "corazon", label: "Corazón", descripcion: "El alma de la fragancia, donde vive su carácter." },
  { key: "fondo", label: "Fondo", descripcion: "El rastro que perdura, cálido y memorable." },
];

/**
 * Vista cinemática inmersiva del producto.
 * - Entrada con timeline GSAP (envoltura + imagen + texto + notas en stagger).
 * - Desglose de notas olfativas en 3 capas con iconos minimalistas.
 * - CTA WhatsApp directo + agregar al carrito.
 * - Estado "Agotado" sofisticado con solicitud de reingreso.
 */
export function ProductModal({ perfume, onClose }: ProductModalProps) {
  const { agregar } = useCart();
  const [cantidad, setCantidad] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const notasRef = useRef<HTMLDivElement>(null);

  const agotado = perfume ? perfume.stock_disponible <= 0 : false;
  const enOferta =
    perfume && perfume.en_oferta && perfume.precio_descuento != null;

  // Reset cantidad al cambiar de producto
  useEffect(() => {
    setCantidad(1);
  }, [perfume?.id]);

  // Contar +1 en clicks_mensuales cuando un cliente abre el detalle.
  // Fire-and-forget: no bloquea la UX si falla.
  useEffect(() => {
    if (!perfume?.id) return;
    if (perfume.id.startsWith("fb-")) return; // no contar perfumes del fallback local
    fetch("/api/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: perfume.id }),
    }).catch(() => {
      /* ignorar: el contador no es crítico */
    });
  }, [perfume?.id]);

  // Bloquear scroll del body cuando abre + avisar al botón de WhatsApp
  useEffect(() => {
    if (!perfume) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.dispatchEvent(
      new CustomEvent("sultan:producto-modal", { detail: true })
    );
    return () => {
      document.body.style.overflow = prev;
      window.dispatchEvent(
        new CustomEvent("sultan:producto-modal", { detail: false })
      );
    };
  }, [perfume]);

  // Timeline GSAP de entrada.
  // ⚠️ Depende del ID (no del objeto): el CatalogProvider refresca el catálogo y
  // regenera los objetos con nueva identidad → con [perfume] la timeline se
  // reiniciaba en loop y los .nota-chip (lo ÚLTIMO de la timeline) nunca llegaban
  // a hacerse visibles: "la pirámide olfativa no aparece". Con el id, anima UNA
  // vez por producto abierto.
  useEffect(() => {
    if (!perfume || !innerRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        // Seguro: pase lo que pase con la timeline, al final TODO queda visible.
        onComplete: () => {
          gsap.set(".nota-capa, .nota-chip", { clearProps: "opacity,transform" });
        },
      });
      tl.from(".modal-veil", { opacity: 0, duration: 0.4 })
        .from(".modal-image", { scale: 1.1, opacity: 0, duration: 1 }, "-=0.2")
        .from(
          ".modal-eyebrow",
          { y: 20, opacity: 0, duration: 0.6 },
          "-=0.7"
        )
        .from(".modal-title", { y: 30, opacity: 0, duration: 0.7 }, "-=0.5")
        .from(".modal-desc", { y: 20, opacity: 0, duration: 0.6 }, "-=0.5")
        .from(
          ".modal-price",
          { y: 20, opacity: 0, duration: 0.6 },
          "-=0.4"
        )
        .from(
          ".modal-cta",
          { y: 20, opacity: 0, duration: 0.6, stagger: 0.1 },
          "-=0.4"
        );

      // Notas olfativas: aparecen en stagger por capa
      if (notasRef.current) {
        tl.from(
          ".nota-capa",
          { y: 30, opacity: 0, duration: 0.7, stagger: 0.18 },
          "-=0.3"
        ).from(
          ".nota-chip",
          { y: 14, opacity: 0, duration: 0.4, stagger: 0.04 },
          "-=0.4"
        );
      }
    }, rootRef);

    return () => { ctx.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id a propósito (ver comentario arriba)
  }, [perfume?.id]);

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!perfume) return null;

  const precio = precioEfectivo(perfume);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto py-4 md:items-center md:py-8"
      role="dialog"
      aria-modal="true"
      aria-label={perfume.nombre}
    >
      {/* Velo */}
      <div
        className="modal-veil fixed inset-0 bg-obsidian/95 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Contenedor */}
      <div
        ref={innerRef}
        className="relative z-10 w-full max-w-5xl px-3 md:px-4"
      >
        <div className="overflow-hidden rounded-sm border border-gold/20 bg-coal/95 shadow-[0_0_80px_-20px_rgba(212,175,55,0.3)] md:grid md:grid-cols-2">
          {/* Imagen — en móvil tiene altura fija visible */}
          <div className="relative h-64 w-full md:h-auto md:min-h-[600px]">
            {perfume.url_imagen ? (
              <Image
                src={perfume.url_imagen}
                alt={perfume.nombre}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="modal-image object-cover object-top"
                priority
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-gold/[0.08] via-coal to-obsidian px-6 text-center">
                <span className="font-display text-5xl italic text-gold/40">M</span>
                <span className="font-display text-lg text-ivory/50">{perfume.nombre}</span>
                <span className="text-[0.55rem] uppercase tracking-imperial text-gold/40">Foto en camino</span>
              </div>
            )}
            {/* Gradiente inferior para integrar con el panel de texto */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-coal/90 md:bg-gradient-to-t md:from-obsidian/60 md:via-transparent md:to-transparent" />

            {/* Sello de oferta */}
            {enOferta && (
              <div className="absolute left-4 top-4">
                <div className="seal-offer">
                  <span className="flex flex-col items-center leading-none">
                    <span className="font-semibold text-[0.8rem]">
                      {perfume.porcentaje_descuento}%
                    </span>
                    <span className="text-[0.5rem] tracking-widest">OFF</span>
                  </span>
                </div>
              </div>
            )}

            {/* Marca */}
            <div className="absolute right-4 top-4 border border-gold/30 bg-obsidian/80 px-3 py-1.5 text-[0.6rem] uppercase tracking-regal text-ivory/90 backdrop-blur-sm">
              {perfume.marca}
            </div>

            {/* Botón cerrar en móvil — encima de la imagen */}
            <button
              onClick={onClose}
              className="absolute right-4 bottom-4 flex h-9 w-9 items-center justify-center rounded-full border border-gold/30 bg-obsidian/80 text-ivory/80 backdrop-blur-sm transition-colors hover:text-gold-champagne md:hidden"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* Detalle — en móvil también limita altura y hace scroll interno,
              para que el botón "Agregar al carrito" nunca quede fuera de pantalla */}
          <div className="flex max-h-[70vh] flex-col overflow-y-auto p-6 md:max-h-[600px] md:p-10">
            <div className="flex items-start justify-between">
              <p className="modal-eyebrow eyebrow text-[0.6rem]">
                {perfume.categoria.join(" · ")}
              </p>
              {/* Botón cerrar en desktop */}
              <button
                onClick={onClose}
                className="hidden text-ivory/50 transition-colors hover:text-gold-champagne md:block"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" strokeWidth={1.25} />
              </button>
            </div>

            <h2 className="modal-title mt-3 font-display text-3xl leading-tight text-ivory md:text-4xl lg:text-5xl">
              {perfume.nombre}
            </h2>

            {/* Badge de concentración (EDP / EDT / Parfum), derivado del nombre */}
            {concentracionDe(perfume) && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/[0.07] px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-regal text-gold-champagne">
                {concentracionDe(perfume)}
              </div>
            )}

            {/* Descripción con mejor contraste */}
            <p className="modal-desc mt-4 text-sm leading-relaxed text-ivory/85 md:text-base">
              {perfume.descripcion}
            </p>

            {/* Volumen + stock */}
            <div className="mt-4 flex items-center gap-4 text-xs uppercase tracking-regal text-ivory/60">
              <span>{perfume.volumen_ml} ml</span>
              <span className="h-3 w-px bg-gold/30" />
              <span>
                {agotado ? "Agotado temporalmente" : "Unidades disponibles"}
              </span>
            </div>

            {/* Precio */}
            <div className="modal-price mt-5 flex items-end gap-4">
              {enOferta && (
                <span className="price-strike text-sm">
                  {formatGs(perfume.precio_regular)}
                </span>
              )}
              <span className="font-display text-3xl text-gold-gradient md:text-4xl">
                {formatGs(precio)}
              </span>
              {enOferta && (
                <span className="mb-1 flex items-center gap-1 text-[0.65rem] uppercase tracking-regal text-gold/80">
                  <Sparkles className="h-3 w-3" /> Oferta exclusiva
                </span>
              )}
            </div>

            {/* Selector cantidad + CTA */}
            {!agotado && (
              <div className="modal-cta mt-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-full border border-gold/25 bg-obsidian/40 p-1">
                  <button
                    onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ivory/80 transition-colors hover:bg-gold/10 hover:text-gold-champagne"
                    aria-label="Restar"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-medium text-ivory">
                    {cantidad}
                  </span>
                  <button
                    onClick={() =>
                      setCantidad((c) => Math.min(perfume.stock_disponible, c + 1))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ivory/80 transition-colors hover:bg-gold/10 hover:text-gold-champagne"
                    aria-label="Sumar"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    agregar(perfume, cantidad);
                    onClose();
                  }}
                  className="btn-luxe flex-1 !text-[0.65rem]"
                >
                  Agregar al carrito
                </button>
              </div>
            )}

            {/* CTA WhatsApp directo */}
            {!agotado ? (
              <a
                href={buildWhatsAppUrl(perfume.nombre, WHATSAPP_NUMBER)}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-cta mt-3 flex items-center justify-center gap-2 rounded-full border border-[#25D366]/40 py-3 text-[0.7rem] font-medium uppercase tracking-regal text-[#25D366] transition-all hover:border-[#25D366] hover:bg-[#25D366]/5 hover:shadow-[0_0_24px_-6px_rgba(37,211,102,0.6)]"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                Pedir ahora por WhatsApp
              </a>
            ) : (
              <a
                href={buildWhatsAppUrl(
                  `${perfume.nombre} (solicito aviso de reingreso)`,
                  WHATSAPP_NUMBER
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-cta mt-3 flex items-center justify-center gap-2 rounded-full border border-gold/25 py-3 text-[0.65rem] uppercase tracking-regal text-ivory/70 transition-all hover:border-gold/50 hover:text-gold-champagne"
              >
                <Bell className="h-4 w-4" strokeWidth={1.5} />
                Solicitar notificación de reingreso
              </a>
            )}

            {/* Notas olfativas — desglose cinemático en 3 capas */}
            <div ref={notasRef} className="mt-8 border-t border-gold/15 pt-6">
              <h3 className="eyebrow mb-5 text-[0.65rem]">Pirámide olfativa</h3>
              <div className="space-y-5">
                {CAPAS.map((capa) => {
                  const notas = perfume.notas_olfativas[capa.key] ?? [];
                  return (
                    <div key={capa.key} className="nota-capa">
                      <div className="mb-2 flex items-baseline gap-3">
                        <span className="font-lapidary text-sm font-medium tracking-regal text-gold">
                          {capa.label}
                        </span>
                        <span className="h-px flex-1 bg-gold/15" />
                        <span className="hidden text-[0.6rem] italic text-ivory/50 md:inline">
                          {capa.descripcion}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {notas.map((n, i) => (
                          <span
                            key={`${n}-${i}`}
                            className="nota-chip group flex items-center gap-1.5 rounded-full border border-gold/20 bg-ivory/[0.04] px-3 py-1.5 text-xs font-medium text-ivory/85 transition-all hover:border-gold/50 hover:text-gold-champagne"
                          >
                            <NoteIcon
                              nota={n}
                              className="h-3.5 w-3.5 text-gold/80"
                            />
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
