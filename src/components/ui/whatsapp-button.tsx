"use client";

import { WhatsappGlifo } from "@/components/ui/whatsapp-glifo";

import { useEffect, useState } from "react";
import {
  WHATSAPP_MENSAJE_FLOTANTE,
  buildWaLink,
} from "@/data/site-config";

/**
 * Botón flotante de WhatsApp premium.
 * Estética de alta costura: negro absoluto + borde dorado + glow dorado.
 * Aparece con un fade-in suave cuando el cliente navega.
 * Se OCULTA automáticamente cuando se abre un modal de producto o el checkout,
 * para no tapar botones críticos (Agregar al carrito, Pedir, etc.).
 * Mensaje: "Hola, busco asistencia personalizada".
 */
export function WhatsAppButton() {
  const [visible, setVisible] = useState(false);
  const [ocultoPorModal, setOcultoPorModal] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Aparece 2.5s después de montar
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Escuchar aperturas de modal de producto y checkout
  useEffect(() => {
    const onProductoAbierto = (e: Event) =>
      setOcultoPorModal(Boolean((e as CustomEvent).detail));
    const onCheckout = (e: Event) =>
      setOcultoPorModal(Boolean((e as CustomEvent).detail));

    window.addEventListener("sultan:producto-modal", onProductoAbierto);
    window.addEventListener("sultan:checkout-modal", onCheckout);
    return () => {
      window.removeEventListener("sultan:producto-modal", onProductoAbierto);
      window.removeEventListener("sultan:checkout-modal", onCheckout);
    };
  }, []);

  // Pulso magnético constante cada 6 segundos
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      return () => clearTimeout(t);
    }, 6000);
    return () => clearInterval(interval);
  }, [visible]);

  const mostrar = visible && !ocultoPorModal;

  return (
    <a
      href={buildWaLink(WHATSAPP_MENSAJE_FLOTANTE)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className={`wa-float-btn ${mostrar ? "wa-float-visible" : "wa-float-hidden"} ${pulse ? "wa-float-pulse" : ""}`}
    >
      {/* Onda expansiva dorada */}
      <span className="wa-ripple" aria-hidden="true" />
      <span className="wa-ripple wa-ripple-delay" aria-hidden="true" />

      {/* Icono WhatsApp SVG premium */}
      <WhatsappGlifo className="relative z-10 h-6 w-6" />

      {/* Tooltip */}
      <span className="wa-tooltip">Asesoría por WhatsApp</span>
    </a>
  );
}
