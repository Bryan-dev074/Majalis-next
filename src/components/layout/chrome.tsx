"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";

import { Navbar } from "@/components/layout/navbar";
import { useCatalog, useProductDetail } from "@/hooks/use-catalog";

// Bundle separado del HTML inicial. Se prepara en cliente para que el primer
// clic no espere la descarga del componente; sin producto no pinta UI.
const ProductModal = dynamic(
  () => import("@/components/catalog/product-modal").then((m) => m.ProductModal),
  { ssr: false }
);

/**
 * "Chrome" de la app: navbar + modal global de producto.
 * Vive en el layout y necesita acceso al contexto de catálogo
 * (la búsqueda del navbar abre el modal; el modal vive una sola vez).
 * Es Client porque usa el hook useCatalog.
 */
export function Chrome() {
  const { perfumes, abrirDetalle } = useCatalog();
  return (
    <>
      <Navbar perfumes={perfumes} onSeleccionarPerfume={abrirDetalle} />
      <DetalleGlobal />
    </>
  );
}

function DetalleGlobal() {
  const { detalle, abrirDetalle } = useProductDetail();
  const cerrar = useCallback(() => abrirDetalle(null), [abrirDetalle]);
  return <ProductModal perfume={detalle} onClose={cerrar} />;
}
