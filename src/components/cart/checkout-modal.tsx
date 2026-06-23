"use client";

import { useEffect, useState } from "react";
import { X, MessageCircle, ShoppingBag, Tag, Check } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatGs } from "@/lib/format";
import { buildWhatsAppCheckoutUrl } from "@/lib/format";
import {
  DeliveryProfile,
} from "@/components/cart/delivery-profile";
import { useDeliveryProfile } from "@/hooks/use-delivery-profile";
import { WHATSAPP_NUMBER } from "@/data/site-config";

interface CheckoutModalProps {
  abierto: boolean;
  onClose: () => void;
}

/**
 * Modal de checkout.
 * - Permite aplicar cupón.
 * - Permite completar (opcionalmente) datos de delivery — persisten entre sesiones.
 * - El botón principal abre WhatsApp con el pedido completo y VACÍA el carrito.
 * - Pantalla de confirmación con resumen del total enviado.
 * - Avisa al botón flotante de WhatsApp para que se oculte mientras esté abierto.
 */
export function CheckoutModal({ abierto, onClose }: CheckoutModalProps) {
  const { items, subtotal, descuento, total, aplicarCodigo, quitarCupon, cuponAplicado, estadoCupon, vaciar } =
    useCart();
  const { perfil: delivery } = useDeliveryProfile();

  const [codigo, setCodigo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [totalEnviado, setTotalEnviado] = useState(0);

  // Avisar al botón de WhatsApp cuando el modal esté abierto
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sultan:checkout-modal", { detail: abierto })
    );
    if (!abierto) return;
    return () => {
      window.dispatchEvent(
        new CustomEvent("sultan:checkout-modal", { detail: false })
      );
    };
  }, [abierto]);

  if (!abierto) return null;

  const aplicar = () => {
    if (!codigo.trim()) return;
    aplicarCodigo(codigo);
  };

  const enviarWhatsApp = () => {
    const url = buildWhatsAppCheckoutUrl(items, WHATSAPP_NUMBER, {
      nombre: delivery.nombre,
      ciudad: delivery.ciudad,
      direccion: delivery.direccion,
      whatsapp: delivery.whatsapp,
    });
    // Guardamos el total antes de vaciar para mostrarlo en la confirmación
    setTotalEnviado(total);
    window.open(url, "_blank", "noopener,noreferrer");
    // Vaciamos el carrito automáticamente tras el pedido
    vaciar();
    setCodigo("");
    setConfirmado(true);
  };

  const continuarComprando = () => {
    setConfirmado(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto p-4 md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Finalizar pedido"
    >
      <div
        className="absolute inset-0 bg-obsidian/95 backdrop-blur-xl"
        onClick={continuarComprando}
      />

      <div className="relative z-10 my-4 w-full max-w-lg md:my-8">
        <div className="overflow-hidden rounded-sm border border-gold/20 bg-coal/98 shadow-[0_0_60px_-15px_rgba(212,175,55,0.3)]">
          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-gold/10 bg-obsidian/70 px-6 py-5">
            <div>
              <p className="eyebrow !justify-start text-[0.6rem]">Finalizar pedido</p>
              <h3 className="mt-1 font-display text-2xl text-ivory">
                {confirmado ? "Pedido enviado" : "Tu elixir te espera"}
              </h3>
            </div>
            <button
              onClick={continuarComprando}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/20 text-ivory/60 transition-colors hover:border-gold/50 hover:text-gold-champagne"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {confirmado ? (
            /* ---------- Pantalla de confirmación ---------- */
            <div className="px-7 py-10 text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]">
                <Check className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-ivory/80">
                Abrimos WhatsApp con tu pedido listo para enviar. Tu carrito
                ya quedó vacío. Nuestro asesor coordinará la entrega y el
                pago al recibir.
              </p>

              <div className="mt-6 rounded-sm border border-gold/20 bg-gold/[0.04] p-4">
                <p className="text-xs uppercase tracking-regal text-gold/80">
                  Total a pagar al recibir
                </p>
                <p className="mt-1 font-display text-3xl text-gold-gradient">
                  {formatGs(totalEnviado)}
                </p>
              </div>

              <button
                onClick={continuarComprando}
                className="btn-luxe mt-7 w-full"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
                  Seguir explorando
                </span>
              </button>
            </div>
          ) : (
            /* ---------- Pantalla de checkout ---------- */
            <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
              {/* Resumen de productos */}
              <div className="mb-5 space-y-2">
                {items.map((it) => (
                  <div
                    key={it.perfume.id}
                    className="flex items-center justify-between"
                  >
                    <span className="flex-1 text-sm font-medium text-ivory/90">
                      {it.perfume.nombre}
                      <span className="ml-1.5 text-xs text-ivory/50">×{it.cantidad}</span>
                    </span>
                    <span className="text-sm font-medium text-ivory/80">{formatGs(
                      (it.perfume.en_oferta && it.perfume.precio_descuento != null
                        ? it.perfume.precio_descuento
                        : it.perfume.precio_regular) * it.cantidad
                    )}</span>
                  </div>
                ))}
              </div>

              {/* Cupón */}
              <div className="mb-5 border-t border-gold/10 pt-5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gold/60" strokeWidth={1.25} />
                    <input
                      type="text"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                      placeholder="Código de descuento"
                      className="field-luxe !pl-8 uppercase text-sm"
                    />
                  </div>
                  <button
                    onClick={aplicar}
                    className="btn-ghost-luxe !px-4 !py-2 !text-[0.65rem]"
                  >
                    Aplicar
                  </button>
                </div>
                {estadoCupon && (
                  <p
                    className={`mt-2 text-xs font-medium ${
                      cuponAplicado ? "text-[#25D366]" : "text-ivory/60"
                    }`}
                  >
                    {estadoCupon}
                  </p>
                )}
                {cuponAplicado && (
                  <button
                    onClick={() => {
                      quitarCupon();
                      setCodigo("");
                    }}
                    className="mt-1 text-[0.65rem] uppercase tracking-regal text-ivory/40 hover:text-ivory/70"
                  >
                    Quitar cupón
                  </button>
                )}
              </div>

              {/* Perfil delivery */}
              <div className="mb-5">
                <DeliveryProfile />
              </div>

              {/* Totales */}
              <div className="space-y-2 border-t border-gold/10 pt-5">
                <div className="flex justify-between">
                  <span className="text-sm text-ivory/70">Subtotal</span>
                  <span className="text-sm font-medium text-ivory/80">{formatGs(subtotal)}</span>
                </div>
                {descuento > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-[#25D366]">Descuento</span>
                    <span className="text-sm font-medium text-[#25D366]">− {formatGs(descuento)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-2">
                  <span className="text-xs uppercase tracking-regal text-ivory/60">
                    Total · pago al recibir
                  </span>
                  <span className="font-display text-3xl text-gold-gradient">
                    {formatGs(total)}
                  </span>
                </div>
              </div>

              {/* CTA principal — WhatsApp */}
              <button
                onClick={enviarWhatsApp}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1faa52] to-[#25D366] py-4 text-[0.75rem] font-semibold uppercase tracking-regal text-obsidian transition-all hover:shadow-[0_0_40px_-8px_rgba(37,211,102,0.8)]"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
                Enviar pedido por WhatsApp
              </button>

              {/* Continuar comprando */}
              <button
                onClick={continuarComprando}
                className="mt-3 w-full text-center text-[0.65rem] uppercase tracking-regal text-ivory/50 transition-colors hover:text-gold-champagne"
              >
                Continuar comprando
              </button>

              <p className="mt-4 text-center text-[0.6rem] uppercase tracking-regal text-ivory/40">
                Coordinamos la entrega y el método de pago por WhatsApp
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
