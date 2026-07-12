import { Hero } from "@/components/sections/hero";
import { Importacion } from "@/components/sections/importacion";
import { CatalogoClient } from "@/components/sections/catalogo-client";
import { MarcasMarquee } from "@/components/sections/marcas-marquee";

/**
 * Página principal.
 * El catálogo lo provee <CatalogProvider> en el layout (lo carga desde
 * /api/catalogo con fallback local al seed). Aquí solo orquestamos las secciones.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <MarcasMarquee />
      {/* En TELÉFONO el proceso (01-02-03) va DESPUÉS de los productos, arriba
          del footer; en desktop mantiene su lugar (pedido del dueño 12-jul). */}
      <div className="flex flex-col">
        <div className="order-2 md:order-1"><Importacion /></div>
        <div className="order-1 md:order-2"><CatalogoClient /></div>
      </div>
    </>
  );
}
