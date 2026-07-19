"use client";

import { useEffect, useState } from "react";
import { X, MessageCircle, ShoppingBag, Tag, Check, Truck } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatGs } from "@/lib/format";
import {
  DeliveryProfile,
} from "@/components/cart/delivery-profile";
import { useDeliveryProfile } from "@/hooks/use-delivery-profile";
import { useCerrarConAtras } from "@/hooks/use-cerrar-con-atras";
import { PROMO_ENVIO } from "@/data/site-config";

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
  const {
    items,
    subtotal,
    descuento,
    total,
    aplicarCodigo,
    quitarCupon,
    cuponAplicado,
    estadoCupon,
    vaciar,
    catalogoListoParaComprar,
    verificandoCatalogo,
    recargarCatalogo,
  } = useCart();
  const { perfil: delivery } = useDeliveryProfile();

  const [codigo, setCodigo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [totalEnviado, setTotalEnviado] = useState(0);
  const [validandoCupon, setValidandoCupon] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorCheckout, setErrorCheckout] = useState("");

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

  // Botón "atrás" cierra el checkout (queda apilado sobre el carrito).
  useCerrarConAtras(abierto, onClose);

  if (!abierto) return null;

  const aplicar = async () => {
    if (!codigo.trim()) return;
    setValidandoCupon(true);
    await aplicarCodigo(codigo);
    setValidandoCupon(false);
  };

  const enviarWhatsApp = async () => {
    if (!catalogoListoParaComprar || items.length === 0 || enviando) return;
    setEnviando(true);
    setErrorCheckout("");

    // Abrimos la pestaña dentro del gesto del usuario para que el navegador no
    // la bloquee mientras esperamos la validación server-side sin caché.
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          items: items.map((item) => ({ id: item.perfume.id, cantidad: item.cantidad })),
          codigoCupon: cuponAplicado?.codigo ?? null,
          totalEsperado: total,
          delivery: {
            nombre: delivery.nombre,
            ciudad: delivery.ciudad,
            direccion: delivery.direccion,
            whatsapp: delivery.whatsapp,
          },
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        url?: string;
        total?: number;
        mensaje?: string;
        precioCambio?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.url?.startsWith("https://wa.me/")) {
        popup?.close();
        setErrorCheckout(payload.mensaje ?? "No pudimos verificar el pedido. Intentá de nuevo.");
        if (response.status === 409 || payload.precioCambio) recargarCatalogo();
        return;
      }

      const totalConfirmado = Number(payload.total);
      setTotalEnviado(Number.isFinite(totalConfirmado) ? totalConfirmado : total);
      if (popup) popup.location.replace(payload.url);
      else window.location.assign(payload.url);
      vaciar();
      setCodigo("");
      setConfirmado(true);
    } catch {
      popup?.close();
      setErrorCheckout("No pudimos verificar el pedido ahora. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
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
                ya quedó vacío. Nuestro asesor coordinará la entrega de tu
                pedido con rastreo directo hasta tu puerta.
              </p>

              <div className="mt-6 rounded-sm border border-gold/20 bg-gold/[0.04] p-4">
                <p className="text-xs uppercase tracking-regal text-gold/80">
                  Total del pedido
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
                    disabled={validandoCupon}
                    className="btn-ghost-luxe !px-4 !py-2 !text-[0.65rem]"
                  >
                    {validandoCupon ? "Validando…" : "Aplicar"}
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
                  <span className="text-xs uppercase tracking-regal text-ivory/70">
                    Total del pedido
                  </span>
                  <span className="font-display text-3xl text-gold-gradient">
                    {formatGs(total)}
                  </span>
                </div>
              </div>

              {/* Sello premium de envío — arriba del CTA, con camioncito animado */}
              {PROMO_ENVIO.activo && (
                <div className="envio-badge mt-6" role="status">
                  <span className="envio-badge-icono">
                    <Truck className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm tracking-wide text-gold-champagne">
                      {PROMO_ENVIO.titulo}
                    </span>
                    <span className="block text-[0.62rem] uppercase tracking-regal text-ivory/60">
                      {PROMO_ENVIO.detalle}
                    </span>
                  </span>
                </div>
              )}

              {/* CTA principal — WhatsApp */}
              {!catalogoListoParaComprar && (
                <div className="mt-4 rounded-sm border border-amber-400/25 bg-amber-400/[0.06] p-3 text-center">
                  <p className="text-xs leading-relaxed text-amber-100/80">
                    Falta confirmar que estos precios y el stock siguen vigentes.
                  </p>
                  <button
                    type="button"
                    onClick={recargarCatalogo}
                    disabled={verificandoCatalogo}
                    className="mt-2 text-[0.62rem] uppercase tracking-regal text-gold-champagne underline underline-offset-4 disabled:opacity-50"
                  >
                    {verificandoCatalogo ? "Verificando…" : "Verificar precio y stock"}
                  </button>
                </div>
              )}
              {errorCheckout && (
                <p className="mt-4 rounded-sm border border-red-400/25 bg-red-400/[0.06] p-3 text-center text-xs leading-relaxed text-red-100/80">
                  {errorCheckout}
                </p>
              )}
              <button
                onClick={enviarWhatsApp}
                disabled={!catalogoListoParaComprar || items.length === 0 || enviando}
                className="wa-checkout-btn mt-3 flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#1faa52] to-[#25D366] px-5 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_30px_-10px_rgba(37,211,102,0.7)] disabled:cursor-not-allowed disabled:opacity-45 sm:text-[0.78rem]"
              >
                <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                <span className="leading-tight">{enviando ? "Verificando pedido…" : "Enviar pedido por WhatsApp"}</span>
              </button>

              <p className="mt-4 text-center text-[0.6rem] uppercase tracking-regal text-ivory/50">
                Coordinamos la entrega y el método de pago por WhatsApp
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
