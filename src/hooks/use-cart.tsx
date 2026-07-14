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
import { CartItem, Cupon, Perfume } from "@/types/database";
import {
  descuentoCarrito,
  precioEfectivo,
  subtotalCarrito,
  totalCarrito,
  validarCupon,
} from "@/lib/format";
import { FALLBACK_CUPONES } from "@/data/fallback-cupones";

interface CartContextValue {
  items: CartItem[];
  cuponesDisponibles: Cupon[];
  cuponAplicado: Cupon | null;
  estadoCupon: string;
  abrirCart: boolean;
  // Acciones
  agregar: (perfume: Perfume, cantidad?: number) => void;
  quitar: (perfumeId: string) => void;
  cambiarCantidad: (perfumeId: string, cantidad: number) => void;
  vaciar: () => void;
  aplicarCodigo: (codigo: string) => boolean;
  quitarCupon: () => void;
  setAbrirCart: (v: boolean) => void;
  // Derivados
  cantidadTotal: number;
  subtotal: number;
  descuento: number;
  total: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "sultan-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [cuponAplicado, setCuponAplicado] = useState<Cupon | null>(null);
  const [estadoCupon, setEstadoCupon] = useState<string>("");
  const [abrirCart, setAbrirCart] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  // Cargar estado persistido al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) setItems(parsed);
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

  const agregar = useCallback((perfume: Perfume, cantidad = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.perfume.id === perfume.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = {
          ...copia[idx],
          cantidad: copia[idx].cantidad + cantidad,
        };
        return copia;
      }
      return [...prev, { perfume, cantidad }];
    });
    setAbrirCart(true);
  }, []);

  const quitar = useCallback((perfumeId: string) => {
    setItems((prev) => prev.filter((it) => it.perfume.id !== perfumeId));
  }, []);

  const cambiarCantidad = useCallback((perfumeId: string, cantidad: number) => {
    setItems((prev) =>
      prev
        .map((it) =>
          it.perfume.id === perfumeId
            ? { ...it, cantidad: Math.max(1, Math.min(99, cantidad)) }
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
    (codigo: string): boolean => {
      const res = validarCupon(codigo, FALLBACK_CUPONES);
      setEstadoCupon(res.mensaje);
      if (res.valido && res.cupon) {
        setCuponAplicado(res.cupon);
        return true;
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
      cuponesDisponibles: FALLBACK_CUPONES,
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
