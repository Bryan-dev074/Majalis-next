import { Hero } from "@/components/sections/hero";
import { Importacion } from "@/components/sections/importacion";
import { CatalogoClient } from "@/components/sections/catalogo-client";
import { MarcasMarquee } from "@/components/sections/marcas-marquee";
import { DisponiblesCta } from "@/components/sections/disponibles-cta";

/**
 * Página principal.
 * El catálogo lo provee <CatalogProvider> en el layout (lo carga desde
 * /api/catalogo con fallback local al seed). Aquí solo orquestamos las secciones.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      {/* Cuántos perfumes hay HOY + CTA de stock por WhatsApp (04-jul) */}
      <DisponiblesCta />
      <MarcasMarquee />
      <Importacion />
      <CatalogoClient />
    </>
  );
}
