import { Perfume } from "@/types/database";
import { precioEfectivo } from "@/lib/format";

/** Desde 1.000.000 Gs un producto es ALTA GAMA (misma vara que la corona del precio). */
export const UMBRAL_PREMIUM = 1_000_000;

/**
 * Categorías de la tienda (jul-2026): además de perfumes, Majalis vende
 * miniaturas (30ml/15ml/10ml), desodorantes de las mismas casas y kits/sets
 * de regalo. Los perfumes de casas nicho tienen su propia vitrina.
 *
 * `tipo_producto` viene del catálogo maestro (perfume | mini | deo | kit) y
 * `es_nicho` marca las casas de autor (Xerjoff, Nishane, Amouage, PdM…).
 */
export type CategoriaId = "todas" | "perfume" | "nicho" | "mini" | "deo" | "kit" | "premium";

export const CATEGORIAS_TIENDA: {
  id: Exclude<CategoriaId, "todas">;
  label: string;
  singular: string;
  plural: string;
}[] = [
  { id: "perfume", label: "Perfumes", singular: "fragancia", plural: "fragancias" },
  { id: "nicho", label: "Nicho", singular: "fragancia de nicho", plural: "fragancias de nicho" },
  { id: "mini", label: "Miniaturas", singular: "miniatura", plural: "miniaturas" },
  { id: "deo", label: "Desodorantes", singular: "desodorante", plural: "desodorantes" },
  { id: "kit", label: "Kits", singular: "kit", plural: "kits" },
  // Corte por PRECIO, no por tipo: las joyas de más de 1.000.000 Gs (cruza
  // categorías — un nicho de 2M vive en Nicho Y en Alta Gama).
  { id: "premium", label: "Alta Gama", singular: "pieza de alta gama", plural: "piezas de alta gama" },
];

/** ¿El producto pertenece a la categoría? "nicho" cruza tipos (una mini nicho
 *  vive en Nicho Y en Miniaturas); "perfume" excluye el nicho (tiene vitrina propia). */
export function enCategoria(p: Perfume, id: CategoriaId): boolean {
  const tipo = p.tipo_producto || "perfume";
  switch (id) {
    case "todas": return true;
    case "nicho": return p.es_nicho === true;
    case "premium": return precioEfectivo(p) >= UMBRAL_PREMIUM;
    case "perfume": return tipo === "perfume" && !p.es_nicho;
    default: return tipo === id;
  }
}

/** Etiqueta de resultados según la categoría activa ("3 desodorantes"). */
export function labelResultados(id: CategoriaId, n: number): string {
  const cat = CATEGORIAS_TIENDA.find((c) => c.id === id);
  if (!cat) return n === 1 ? "producto" : "productos";
  return n === 1 ? cat.singular : cat.plural;
}
