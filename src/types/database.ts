// ============================================================================
//  Tipos estrictos del dominio Sultan Oud Elixir
//  Reflejan exactamente la estructura de `schema.sql`.
// ============================================================================

/** Notas olfativas en tres capas: Salida, Corazón y Fondo. */
export interface FragranceNotes {
  salida: string[];
  corazon: string[];
  fondo: string[];
}

/**
 * Vínculo del producto con una tienda/proveedor externo donde también se consigue.
 * Sirve para reencontrar el producto si su URL cambia (buscando por código).
 */
export interface TiendaProducto {
  tienda: string; // nombre de la tienda/proveedor. Ej: "Mercado Libre", "Dropi"
  url: string;    // URL del producto en esa tienda
  codigo: string; // código/id del producto en esa tienda
}

/** Perfume del catálogo. */
export interface Perfume {
  id: string;
  nombre: string;
  marca: string;
  precio_regular: number;
  precio_descuento: number | null;
  en_oferta: boolean;
  porcentaje_descuento: number;
  stock_disponible: number;
  volumen_ml: number;
  activo: boolean;
  url_imagen: string;
  descripcion: string;
  notas_olfativas: FragranceNotes;
  categoria: string[];
  /** Tiendas/proveedores externos donde también se consigue este producto. */
  tiendas: TiendaProducto[];
  sku: string | null;
  destacado: boolean;
  /**
   * Origen del perfume:
   *  · false (default) → Stock Local propio (control total, envío inmediato).
   *  · true            → Catálogo Dropi (importado por API futura).
   * Discrimina también por SKU con prefijo "DROPI-".
   */
  es_dropi: boolean;
  /**
   * True si es uno de los perfumes de prueba (seed inicial del sistema).
   * Sirve para identificarlos y ocultarlos en bloque cuando arranques a vender.
   */
  es_demo: boolean;
  /** Contador de vistas del detalle del perfume en el mes actual. */
  clicks_mensuales: number;
  created_at: string;
  updated_at: string;
}

/** Cupón de descuento aplicable en checkout. */
export interface Cupon {
  id: string;
  codigo: string;
  porcentaje_descuento: number;
  activo: boolean;
  limite_usos: number;
  usos_actuales: number;
  fecha_expiracion: string | null;
  created_at: string;
}

/** Perfil de usuario opcional (acelera el delivery en Paraguay). */
export interface PerfilUsuario {
  whatsapp: string;
  nombre_completo: string | null;
  email: string | null;
  rol: string;
  direccion_exacta: string | null;
  ciudad: string | null;
  barrio: string | null;
  indicaciones_delivery: string | null;
  rango_horarios: string | null;
  created_at: string;
}

/** Estado de entrega de un pedido. */
export type EstadoEntrega =
  | "pendiente"
  | "confirmado"
  | "en_camino"
  | "entregado"
  | "cancelado";

/** Línea de producto dentro del desglose de un pedido. */
export interface LineaPedido {
  nombre: string;
  marca: string;
  precio_unit: number;
  cantidad: number;
}

/** Pedido consolidado. */
export interface Pedido {
  id: string;
  perfil_whatsapp: string | null;
  desglose_productos: LineaPedido[];
  subtotal: number;
  descuento_aplicado: number;
  total_final: number;
  estado_entrega: EstadoEntrega;
  created_at: string;
}

// ----------------------------------------------------------------------------
//  Tipos derivados para la UI
// ----------------------------------------------------------------------------

/** Item dentro del carrito de compras. */
export interface CartItem {
  perfume: Perfume;
  cantidad: number;
}

/** Resultado de validación de un cupón. */
export interface CuponResult {
  valido: boolean;
  cupon: Cupon | null;
  mensaje: string;
}
