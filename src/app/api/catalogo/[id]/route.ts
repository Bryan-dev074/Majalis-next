import { NextResponse } from "next/server";
import { fetchDetalleCatalogo } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/** Ficha pública bajo demanda: añade notas olfativas y SKU al resumen. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const perfume = await fetchDetalleCatalogo(id);
    if (!perfume) {
      return NextResponse.json(
        { error: "El producto ya no está disponible." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(perfume, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No pudimos cargar los detalles del producto." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "15" },
      }
    );
  }
}
