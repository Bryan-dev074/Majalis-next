import type { Perfume } from "@/types/database";

export const CORRECCION_CATALOGO_MS = 10 * 60 * 1000;
export interface CorreccionCatalogo { perfume: Perfume; verificadoEn: number }

// Descripción y notas pertenecen a la ficha. No invalidan las miles de tarjetas.
const CAMPOS_RESUMEN = [
  "nombre", "marca", "url_imagen", "volumen_ml", "concentracion", "tipo_producto",
  "precio_regular", "precio_descuento", "en_oferta", "porcentaje_descuento",
  "stock_disponible", "activo",
] as const;

function corregirResumen(resumen: Perfume, ficha: Perfume): Perfume {
  if (CAMPOS_RESUMEN.every((campo) => resumen[campo] === ficha[campo])) return resumen;
  const corregido = { ...resumen };
  for (const campo of CAMPOS_RESUMEN) {
    (corregido as unknown as Record<string, unknown>)[campo] = ficha[campo];
  }
  return corregido;
}

export function actualizarProductoVerificado(lista: Perfume[], ficha: Perfume): Perfume[] {
  const indice = lista.findIndex((p) => p.id === ficha.id);
  if (indice < 0) return lista;
  if (ficha.activo !== true || ficha.stock_disponible <= 0) {
    return lista.filter((p) => p.id !== ficha.id);
  }
  const actualizado = corregirResumen(lista[indice], ficha);
  if (actualizado === lista[indice]) return lista;
  const copia = [...lista];
  copia[indice] = actualizado;
  return copia;
}

/** Una respuesta de ficha sin caché prevalece sobre el listado SWR anterior. */
export function protegerCatalogoConFichas(
  lista: Perfume[], correcciones: Map<string, CorreccionCatalogo>, ahora = Date.now()
): Perfume[] {
  if (correcciones.size === 0) return lista;
  for (const [id, correccion] of correcciones) {
    if (ahora - correccion.verificadoEn >= CORRECCION_CATALOGO_MS) correcciones.delete(id);
  }
  let cambiado = false;
  const resultado: Perfume[] = [];
  for (const resumen of lista) {
    const correccion = correcciones.get(resumen.id)?.perfume;
    if (!correccion) { resultado.push(resumen); continue; }
    if (correccion.activo !== true || correccion.stock_disponible <= 0) { cambiado = true; continue; }
    const actualizado = corregirResumen(resumen, correccion);
    cambiado ||= actualizado !== resumen;
    resultado.push(actualizado);
  }
  return cambiado ? resultado : lista;
}

export function fusionarFichaFresca(anterior: Perfume, fresca: Perfume): Perfume {
  return { ...anterior, ...fresca };
}

export function fichaComprable(
  perfume: Perfume | null, verificado: boolean, cargando: boolean, error: string | null
): boolean {
  return Boolean(perfume && verificado && !cargando && !error
    && perfume.activo === true && perfume.stock_disponible > 0);
}
