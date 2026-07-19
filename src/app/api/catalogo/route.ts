import { NextResponse } from "next/server";
import { fetchCatalogo } from "@/lib/catalog";

/**
 * Endpoint que devuelve el catálogo público (perfumes activos).
 * Devuelve un resumen compacto para tarjetas y filtros. En producción falla de
 * forma cerrada si Supabase no responde; nunca sustituye inventario real por demos.
 *
 * Lo consume el <CatalogProvider> del layout, y permite refrescar el catálogo
 * en el cliente tras ediciones desde /admin.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const perfumes = await fetchCatalogo();
    return NextResponse.json(perfumes, {
      headers: {
        // Los precios cambian durante el día; 60 s mantiene frescura práctica y
        // evita volver a consultar 5 páginas de Supabase por cada visitante.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "El catálogo está temporalmente indisponible." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "30" },
      }
    );
  }
}
