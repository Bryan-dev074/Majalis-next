"use client";

import { useState } from "react";
import { Favoritos } from "@/components/sections/favoritos";
import { Catalogo } from "@/components/sections/catalogo";
import { useCatalog } from "@/hooks/use-catalog";

/**
 * Orquestador cliente de Favoritos + Catálogo.
 * - Lee los perfumes y el detalle del contexto global (<CatalogProvider>).
 * - El modal de detalle vive en el layout (compartido con el Navbar).
 */
export function CatalogoClient() {
  const { perfumes, abrirDetalle } = useCatalog();
  const [query, setQuery] = useState("");

  const destacados = perfumes.filter((p) => p.destacado).slice(0, 6);

  return (
    <>
      {/* La banda de "Favoritos" solo tiene sentido si hay destacados. */}
      {destacados.length > 0 && (
        <Favoritos perfumes={destacados} onAbrirDetalle={abrirDetalle} />
      )}
      <Catalogo
        perfumes={perfumes}
        query={query}
        onQueryChange={setQuery}
        onAbrirDetalle={abrirDetalle}
      />
    </>
  );
}
