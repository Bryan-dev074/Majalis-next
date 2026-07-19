"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { CartItem, CuponPublico, Perfume } from "@/types/database";
import {
  descuentoCarrito,
  precioEfectivo,
  subtotalCarrito,
  totalCarrito,
} from "@/lib/format";
import { useCatalog } from "@/hooks/use-catalog";

interface CartContextValue {
  items: CartItem[];
  cuponAplicado: CuponPublico | null;
  estadoCupon: string;
  abrirCart: boolean;
  // Acciones
  agregar: (perfume: Perfume, cantidad?: number) => void;
  quitar: (perfumeId: string) => void;
  cambiarCantidad: (perfumeId: string, cantidad: number) => void;
  vaciar: () => void;
  aplicarCodigo: (codigo: string) => Promise<boolean>;
  quitarCupon: () => void;
  setAbrirCart: (v: boolean) => void;
  // Derivados
  cantidadTotal: number;
  subtotal: number;
  descuento: number;
  total: number;
  catalogoListoParaComprar: boolean;
  verificandoCatalogo: boolean;
  recargarCatalogo: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "sultan-cart-v1";
const MAX_CANTIDAD_ITEM = 99;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esListaDeStrings(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string");
}

/**
 * localStorage es entrada no confiable y además puede contener esquemas de una
 * versión anterior. Validamos la ficha completa antes de renderizarla; luego el
 * catálogo vigente reemplaza igualmente precio, stock y demás datos por ID.
 */
function esPerfumePersistido(valor: unknown): valor is Perfume {
  if (!esObjeto(valor)) return false;

  const notas = valor.notas_olfativas;
  const tiendas = valor.tiendas;
  const precioDescuento = valor.precio_descuento;
  const concentracion = valor.concentracion;
  const tipoProducto = valor.tipo_producto;
  const esNicho = valor.es_nicho;

  return (
    typeof valor.id === "string" && valor.id.trim().length > 0 &&
    typeof valor.nombre === "string" &&
    typeof valor.marca === "string" &&
    typeof valor.precio_regular === "number" &&
    Number.isFinite(valor.precio_regular) &&
    valor.precio_regular >= 0 &&
    (precioDescuento === null ||
      (typeof precioDescuento === "number" &&
        Number.isFinite(precioDescuento) &&
        precioDescuento >= 0)) &&
    typeof valor.en_oferta === "boolean" &&
    typeof valor.porcentaje_descuento === "number" &&
    Number.isFinite(valor.porcentaje_descuento) &&
    valor.porcentaje_descuento >= 0 &&
    valor.porcentaje_descuento <= 100 &&
    typeof valor.stock_disponible === "number" &&
    Number.isSafeInteger(valor.stock_disponible) &&
    valor.stock_disponible >= 0 &&
    typeof valor.volumen_ml === "number" &&
    Number.isFinite(valor.volumen_ml) &&
    valor.volumen_ml > 0 &&
    (concentracion === undefined ||
      concentracion === null ||
      typeof concentracion === "string") &&
    typeof valor.activo === "boolean" &&
    typeof valor.url_imagen === "string" &&
    typeof valor.descripcion === "string" &&
    (notas === undefined ||
      (esObjeto(notas) &&
        esListaDeStrings(notas.salida) &&
        esListaDeStrings(notas.corazon) &&
        esListaDeStrings(notas.fondo))) &&
    esListaDeStrings(valor.categoria) &&
    (tiendas === undefined ||
      (Array.isArray(tiendas) &&
        tiendas.every(
          (tienda) =>
            esObjeto(tienda) &&
            typeof tienda.tienda === "string" &&
            typeof tienda.url === "string" &&
            typeof tienda.codigo === "string"
        ))) &&
    (valor.sku === undefined || valor.sku === null || typeof valor.sku === "string") &&
    typeof valor.destacado === "boolean" &&
    (valor.es_dropi === undefined || typeof valor.es_dropi === "boolean") &&
    (valor.es_demo === undefined || typeof valor.es_demo === "boolean") &&
    typeof valor.clicks_mensuales === "number" &&
    Number.isSafeInteger(valor.clicks_mensuales) &&
    valor.clicks_mensuales >= 0 &&
    (tipoProducto === undefined || typeof tipoProducto === "string") &&
    (esNicho === undefined || typeof esNicho === "boolean") &&
    (valor.created_at === undefined || typeof valor.created_at === "string") &&
    (valor.updated_at === undefined || typeof valor.updated_at === "string")
  );
}

function esItemPersistido(valor: unknown): valor is CartItem {
  return (
    esObjeto(valor) &&
    esPerfumePersistido(valor.perfume) &&
    typeof valor.cantidad === "number" &&
    Number.isSafeInteger(valor.cantidad) &&
    valor.cantidad > 0 &&
    valor.cantidad <= MAX_CANTIDAD_ITEM
  );
}

/** Actualiza precio/stock desde el listado sin borrar la ficha ya descargada. */
function fusionarConCatalogo(vigente: Perfume, ficha: Perfume): Perfume {
  const fusionado: Perfume = { ...ficha, ...vigente };
  if (!vigente.descripcion && ficha.descripcion) {
    fusionado.descripcion = ficha.descripcion;
  }
  if (ficha.notas_olfativas !== undefined) {
    fusionado.notas_olfativas = ficha.notas_olfativas;
  }
  if (Object.prototype.hasOwnProperty.call(ficha, "sku")) {
    fusionado.sku = ficha.sku;
  }
  return fusionado;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const {
    perfumes,
    cargado: catalogoCargado,
    catalogoValido,
    catalogoListoParaComprar,
    verificando: verificandoCatalogo,
    recargar: recargarCatalogo,
  } = useCatalog();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cuponAplicado, setCuponAplicado] = useState<CuponPublico | null>(null);
  const [estadoCupon, setEstadoCupon] = useState<string>("");
  const [abrirCart, setAbrirCart] = useState(false);
  const [hidratado, setHidratado] = useState(false);
  const perfumesPorId = useMemo(
    () => new Map(perfumes.map((perfume) => [perfume.id, perfume])),
    [perfumes]
  );

  // Cargar estado persistido al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const ids = new Set<string>();
          const validos = parsed.filter((item): item is CartItem => {
            if (!esItemPersistido(item) || ids.has(item.perfume.id)) return false;
            ids.add(item.perfume.id);
            return true;
          });
          setItems(validos);
        }
      }
    } catch {
      /* ignora parseos inválidos */
    }
    setHidratado(true);
  }, []);

  // Persistir al cambiar (solo tras hidratación para no pisar estado server)
  useEffect(() => {
    if (!hidratado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage lleno o inaccesible */
    }
  }, [items, hidratado]);

  // El localStorage puede contener un precio/stock viejo. Cada vez que llega
  // catálogo fresco actualizamos precio/stock y limitamos la cantidad. Los
  // campos de detalle que no viajan en el listado (notas/SKU) se conservan.
  useEffect(() => {
    if (!hidratado || !catalogoCargado || !catalogoValido) return;
    const porId = new Map(perfumes.map((p) => [p.id, p]));
    setItems((prev) =>
      prev.flatMap((it) => {
        const fresco = porId.get(it.perfume.id);
        if (!fresco || fresco.activo === false || fresco.stock_disponible <= 0) return [];
        return [{
          perfume: fusionarConCatalogo(fresco, it.perfume),
          cantidad: Math.max(1, Math.min(it.cantidad, fresco.stock_disponible, MAX_CANTIDAD_ITEM)),
        }];
      })
    );
  }, [catalogoCargado, catalogoValido, hidratado, perfumes]);

  const agregar = useCallback((perfume: Perfume, cantidad = 1) => {
    const vigente = perfumesPorId.get(perfume.id);
    if (!vigente || vigente.activo === false) {
      recargarCatalogo();
      return;
    }
    setItems((prev) => {
      const max = Math.max(0, Math.min(vigente.stock_disponible, MAX_CANTIDAD_ITEM));
      if (max === 0) return prev;
      const idx = prev.findIndex((it) => it.perfume.id === vigente.id);
      if (idx >= 0) {
        const copia = [...prev];
        const fichaDisponible = fusionarConCatalogo(perfume, copia[idx].perfume);
        copia[idx] = {
          perfume: fusionarConCatalogo(vigente, fichaDisponible),
          cantidad: Math.min(max, copia[idx].cantidad + Math.max(1, cantidad)),
        };
        return copia;
      }
      return [
        ...prev,
        {
          perfume: fusionarConCatalogo(vigente, perfume),
          cantidad: Math.min(max, Math.max(1, cantidad)),
        },
      ];
    });
    setAbrirCart(true);
  }, [perfumesPorId, recargarCatalogo]);

  const quitar = useCallback((perfumeId: string) => {
    setItems((prev) => prev.filter((it) => it.perfume.id !== perfumeId));
  }, []);

  const cambiarCantidad = useCallback((perfumeId: string, cantidad: number) => {
    setItems((prev) =>
      prev
        .map((it) =>
          it.perfume.id === perfumeId
            ? {
                ...it,
                cantidad: Math.max(
                  1,
                  Math.min(it.perfume.stock_disponible, cantidad, MAX_CANTIDAD_ITEM)
                ),
              }
            : it
        )
        .filter((it) => it.cantidad > 0)
    );
  }, []);

  const vaciar = useCallback(() => {
    setItems([]);
    setCuponAplicado(null);
    setEstadoCupon("");
  }, []);

  const aplicarCodigo = useCallback(
    async (codigo: string): Promise<boolean> => {
      const limpio = codigo.trim().toUpperCase();
      if (!limpio) {
        setCuponAplicado(null);
        setEstadoCupon("Ingresá un código.");
        return false;
      }
      setEstadoCupon("Verificando código…");
      try {
        const response = await fetch("/api/cupon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: limpio }),
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          cupon?: CuponPublico | null;
          mensaje?: string;
        };
        setEstadoCupon(payload.mensaje ?? "No pudimos validar el código.");
        if (response.ok && payload.ok && payload.cupon) {
          setCuponAplicado(payload.cupon);
          return true;
        }
      } catch {
        setEstadoCupon("No pudimos validar el código ahora. Intentá de nuevo.");
      }
      setCuponAplicado(null);
      return false;
    },
    []
  );

  const quitarCupon = useCallback(() => {
    setCuponAplicado(null);
    setEstadoCupon("");
  }, []);

  const derivados = useMemo(() => {
    const cantidadTotal = items.reduce((acc, it) => acc + it.cantidad, 0);
    const subtotal = subtotalCarrito(items);
    const descuento = descuentoCarrito(items, cuponAplicado);
    const total = totalCarrito(items, cuponAplicado);
    return { cantidadTotal, subtotal, descuento, total };
  }, [items, cuponAplicado]);

  // Precio efectivo re-exportado para consistencia tipada en la UI
  void precioEfectivo;

  // value memoizado: sin esto se creaba un objeto nuevo en CADA render del
  // provider y re-renderizaba a TODOS los consumidores de useCart (las tarjetas
  // visibles) aunque el carrito no hubiera cambiado. Los callbacks ya son
  // estables (useCallback), así que solo cambia cuando cambian los datos reales.
  const value = useMemo<CartContextValue>(
    () => ({
      items,
      cuponAplicado,
      estadoCupon,
      abrirCart,
      agregar,
      quitar,
      cambiarCantidad,
      vaciar,
      aplicarCodigo,
      quitarCupon,
      setAbrirCart,
      cantidadTotal: derivados.cantidadTotal,
      subtotal: derivados.subtotal,
      descuento: derivados.descuento,
      total: derivados.total,
      catalogoListoParaComprar,
      verificandoCatalogo,
      recargarCatalogo,
    }),
    [
      items,
      cuponAplicado,
      estadoCupon,
      abrirCart,
      agregar,
      quitar,
      cambiarCantidad,
      vaciar,
      aplicarCodigo,
      quitarCupon,
      derivados,
      catalogoListoParaComprar,
      verificandoCatalogo,
      recargarCatalogo,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart debe usarse dentro de <CartProvider>");
  }
  return ctx;
}
