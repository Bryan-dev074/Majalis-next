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
        // Una ficha que se ocultó no puede seguir vendiéndose durante SWR.
        // Las imágenes y el listado conservan sus propias cachés.
        "Cache-Control": "no-store",
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
