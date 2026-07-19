import { CartProvider } from "@/hooks/use-cart";
import { CatalogProvider } from "@/hooks/use-catalog";
import { ParticleFieldLazy } from "@/components/three/particle-field-lazy";
import { LiquidCursor } from "@/components/ui/liquid-cursor";
import { Loader } from "@/components/ui/loader";
import { Chrome } from "@/components/layout/chrome";
import { Footer } from "@/components/layout/footer";
import { CartSidebar } from "@/components/cart/cart-sidebar";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";

/**
 * Layout de la tienda pública.
 * Envuelve todo el chrome premium (fondo 3D, cursor, navbar, footer,
 * carrito y botón de WhatsApp) en el grupo de rutas (tienda).
 */
export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CatalogProvider>
      <CartProvider>
        {/* Fondo 3D orgánico fijo (chunk diferido: three.js fuera del bundle crítico) */}
        <ParticleFieldLazy />
        {/* Cursor premium con físicas líquidas */}
        <LiquidCursor />
        <Loader />

        <Chrome />
        <main className="relative z-10">{children}</main>
        <Footer />

        {/* Drawer del carrito — siempre disponible */}
        <CartSidebar />

        {/* Botón flotante de WhatsApp — asistencia */}
        <WhatsAppButton />
      </CartProvider>
    </CatalogProvider>
  );
}
