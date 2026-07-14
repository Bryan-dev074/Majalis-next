"use client";

import dynamic from "next/dynamic";

import { Navbar } from "@/components/layout/navbar";
import { useCatalog } from "@/hooks/use-catalog";

// El modal (y con él GSAP, ~30 KB gz) se carga recién al abrir un producto,
// no en el primer load de la home. Se muestra condicional, así que diferirlo
// no cambia el comportamiento.
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
  const { perfumes, detalle, abrirDetalle } = useCatalog();
  return (
    <>
      <Navbar perfumes={perfumes} onSeleccionarPerfume={abrirDetalle} />
      <ProductModal perfume={detalle} onClose={() => abrirDetalle(null)} />
    </>
  );
}
