"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import type { Perfume } from "@/types/database";
import type {
  CatalogoCompactoPayload,
  ResumenCatalogoCompacto,
} from "@/lib/catalog";

interface CatalogContextValue {
  /** Lista completa de perfumes del catálogo (solo activos / no ocultos). */
  perfumes: Perfume[];
  /** Perfume seleccionado para el modal de detalle (null = cerrado). */
  detalle: Perfume | null;
  /** Establece / cierra el modal de detalle. */
  abrirDetalle: (p: Perfume | null) => void;
  /** La ficha ampliada (notas y SKU) se está cargando bajo demanda. */
  detalleCargando: boolean;
  /** Error de la ficha ampliada; el resumen del producto sigue visible. */
  errorDetalle: string | null;
  /** Reintenta la ficha ampliada del producto abierto. */
  reintentarDetalle: () => void;
  /** Refresca el catálogo (útil tras cambios en /admin). */
  recargar: () => void;
  /** Si ya terminó de cargar el catálogo desde el server. */
  cargado: boolean;
  /** Hubo al menos una respuesta válida; distingue catálogo vacío de caída de red. */
  catalogoValido: boolean;
  /** Momento de la última respuesta válida del catálogo. */
  catalogoVerificadoEn: number | null;
  /** Solo true con una respuesta válida reciente; habilita confirmar pedidos. */
  catalogoListoParaComprar: boolean;
  /** Hay una comprobación de precios/stock en curso. */
  verificando: boolean;
  /** Mensaje visible cuando la última comprobación del catálogo falló. */
  errorCatalogo: string | null;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Claves compartidas con el panel /admin (modo local)
const OCULTOS_KEY = "sultan-admin-ocultos";
const DESTACADOS_KEY = "sultan-admin-destacados";
const DETALLE_CACHE_MS = 5 * 60 * 1000;

interface DetalleCacheado {
  perfume: Perfume;
  verificadoEn: number;
}

/**
 * Conserva notas/SKU ya descargados, pero siempre da prioridad a precio,
 * stock y visibilidad del resumen global más reciente.
 */
function fusionarDetalle(resumen: Perfume, ficha: Perfume): Perfume {
  const fusionado: Perfume = { ...ficha, ...resumen };
  if (!resumen.descripcion && ficha.descripcion) {
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

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esNumero(valor: unknown, minimo = 0): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= minimo;
}

function expandirImagen(valor: string): string | null {
  if (!valor.startsWith("@")) return valor;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/productos/catalogo/${valor.slice(1)}`;
}

function decodificarResumen(valor: unknown): Perfume | null {
  if (!esObjeto(valor)) return null;
  const fila = valor as Partial<ResumenCatalogoCompacto>;
  const categorias = fila.g;
  const imagen = typeof fila.u === "string" ? expandirImagen(fila.u) : null;
  if (
    typeof fila.i !== "string" ||
    !fila.i ||
    typeof fila.n !== "string" ||
    typeof fila.m !== "string" ||
    !esNumero(fila.r) ||
    (fila.d !== undefined && !esNumero(fila.d)) ||
    (fila.x !== undefined && (!esNumero(fila.x) || fila.x > 100)) ||
    !esNumero(fila.s) ||
    !Number.isSafeInteger(fila.s) ||
    !esNumero(fila.v, Number.EPSILON) ||
    imagen === null ||
    !Array.isArray(categorias) ||
    !categorias.every((categoria) => typeof categoria === "string") ||
    (fila.c !== undefined && typeof fila.c !== "string") ||
    (fila.t !== undefined && typeof fila.t !== "string") ||
    (fila.o !== undefined && fila.o !== 1) ||
    (fila.f !== undefined && fila.f !== 1) ||
    (fila.h !== undefined && fila.h !== 1)
  ) {
    return null;
  }

  return {
    id: fila.i,
    nombre: fila.n,
    marca: fila.m,
    precio_regular: fila.r,
    precio_descuento: fila.d ?? null,
    en_oferta: fila.o === 1,
    porcentaje_descuento: fila.x ?? 0,
    stock_disponible: fila.s,
    volumen_ml: fila.v,
    concentracion: fila.c ?? null,
    activo: true,
    url_imagen: imagen,
    descripcion: "",
    categoria: categorias,
    destacado: fila.f === 1,
    clicks_mensuales: 0,
    tipo_producto: fila.t ?? "perfume",
    es_nicho: fila.h === 1,
  };
}

function decodificarCatalogo(valor: unknown): Perfume[] {
  if (
    esObjeto(valor) &&
    valor.version === 2 &&
    Array.isArray(valor.productos)
  ) {
    const payload = valor as unknown as CatalogoCompactoPayload;
    const perfumes = payload.productos.map(decodificarResumen);
    if (perfumes.some((perfume) => perfume == null)) {
      throw new Error("El catálogo compacto contiene una fila inválida");
    }
    return perfumes as Perfume[];
  }

  // Compatibilidad durante una actualización gradual: una pestaña nueva puede
  // alcanzar por unos segundos un endpoint anterior que todavía devuelve
  // objetos Perfume completos.
  if (Array.isArray(valor)) {
    const validos = valor.every(
      (fila) =>
        esObjeto(fila) &&
        typeof fila.id === "string" &&
        typeof fila.nombre === "string" &&
        typeof fila.marca === "string" &&
        esNumero(fila.precio_regular) &&
        esNumero(fila.stock_disponible) &&
        Array.isArray(fila.categoria)
    );
    if (validos) return valor as Perfume[];
  }

  throw new Error("El catálogo devolvió un formato inválido");
}

function leerSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Provee el catálogo y el perfume seleccionado a toda la app.
 *
 * - Carga los perfumes desde `/api/catalogo` al montar; los demos solo existen
 *   en desarrollo cuando se habilitan explícitamente en el servidor.
 * - En modo local (sin Supabase service role), respeta los perfumes que el
 *   administrador ocultó/destacó desde /admin (guardados en localStorage).
 * - Permite refrescar tras ediciones (`sultan:catalogo-cambio`).
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  // Arrancamos vacío: el catálogo real llega de /api/catalogo. Antes
  // arrancaba con FALLBACK_PERFUMES y, si la base venía vacía, esos 11 demos
  // hardcodeados quedaban en pantalla como "fantasmas" imposibles de ocultar.
  const [perfumesBase, setPerfumesBase] = useState<Perfume[]>([]);
  const [detalle, setDetalle] = useState<Perfume | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [catalogoValido, setCatalogoValido] = useState(false);
  const [catalogoVerificadoEn, setCatalogoVerificadoEn] = useState<number | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [token, setToken] = useState(0);
  const [, setTickLocal] = useState(0); // fuerza re-render al cambiar localStorage
  const ultimaSolicitudRef = useRef(0);
  const detalleCacheRef = useRef(new Map<string, DetalleCacheado>());
  const detalleAbortRef = useRef<AbortController | null>(null);
  const detalleSolicitudRef = useRef(0);

  const recargar = useCallback(() => {
    setToken((t) => t + 1);
    setTickLocal((t) => t + 1);
  }, []);

  // Carga inicial + refrescos desde el server
  useEffect(() => {
    let cancelado = false;
    ultimaSolicitudRef.current = Date.now();
    setVerificando(true);
    (async () => {
      try {
        const res = await fetch("/api/catalogo", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Catálogo respondió ${res.status}`);
        }
        const data: unknown = await res.json();
        const perfumesRecibidos = decodificarCatalogo(data);
        // Respetamos la respuesta del servidor aunque sea vacía: si el
        // catálogo quedó sin productos activos, la tienda debe verse vacía,
        // NO con el seed de respaldo (esos demos no se gestionan desde /admin).
        if (!cancelado) {
          setPerfumesBase(perfumesRecibidos);
          setCatalogoValido(true);
          setCatalogoVerificadoEn(Date.now());
          setAhora(Date.now());
          setErrorCatalogo(null);
        }
      } catch {
        if (!cancelado) {
          // Conservamos una versión válida que ya estuviera en pantalla, pero
          // distinguimos claramente una caída inicial de un catálogo vacío.
          setErrorCatalogo(
            "No pudimos comprobar el catálogo en este momento. Revisá tu conexión y reintentá."
          );
        }
      } finally {
        if (!cancelado) {
          setCargado(true);
          setVerificando(false);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Escuchar cambios desde /admin (mismo navegador)
  useEffect(() => {
    const onCambio = () => recargar();
    window.addEventListener("sultan:catalogo-cambio", onCambio);
    // También escuchar cambios directos de storage (otras pestañas)
    const onStorage = (e: StorageEvent) => {
      if (e.key === OCULTOS_KEY || e.key === DESTACADOS_KEY) recargar();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("sultan:catalogo-cambio", onCambio);
      window.removeEventListener("storage", onStorage);
    };
  }, [recargar]);

  // Mantener precios/stock frescos también en pestañas que quedan abiertas.
  // El endpoint usa caché corta, por lo que esto no multiplica consultas a la DB.
  useEffect(() => {
    const intervalo = window.setInterval(recargar, 5 * 60 * 1000);
    const reloj = window.setInterval(() => setAhora(Date.now()), 60 * 1000);
    const alVolver = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - ultimaSolicitudRef.current >= 5 * 60 * 1000
      ) recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(intervalo);
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  // Aplicar overrides locales (modo sin service role)
  const perfumes = useMemo(() => {
    const ocultos = leerSet(OCULTOS_KEY);
    const destacados = leerSet(DESTACADOS_KEY);
    return perfumesBase
      .filter((p) => p.activo !== false && !ocultos.has(p.id))
      .map((p) => (destacados.has(p.id) ? { ...p, destacado: true } : p));
    // leerSet + tick via recargar; eslint-disable por dependencia intencional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfumesBase, token]);

  const cargarDetalle = useCallback((resumen: Perfume, forzar = false) => {
    detalleAbortRef.current?.abort();
    detalleAbortRef.current = null;
    const numeroSolicitud = ++detalleSolicitudRef.current;
    const cacheado = detalleCacheRef.current.get(resumen.id);

    // Abrir es inmediato: se muestra la tarjeta compacta y, si ya existe, se
    // fusiona la ficha cacheada sin sacrificar precio/stock recientes.
    setDetalle(cacheado ? fusionarDetalle(resumen, cacheado.perfume) : resumen);
    setErrorDetalle(null);

    if (
      !forzar &&
      cacheado &&
      Date.now() - cacheado.verificadoEn <= DETALLE_CACHE_MS
    ) {
      setDetalleCargando(false);
      return;
    }

    const controller = new AbortController();
    detalleAbortRef.current = controller;
    setDetalleCargando(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/catalogo/${encodeURIComponent(resumen.id)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Este producto ya no está disponible."
              : "No pudimos cargar la ficha completa."
          );
        }
        if (
          typeof payload !== "object" ||
          payload === null ||
          (payload as { id?: unknown }).id !== resumen.id
        ) {
          throw new Error("La ficha del producto llegó incompleta.");
        }
        if (numeroSolicitud !== detalleSolicitudRef.current) return;

        const ficha = payload as Perfume;
        detalleCacheRef.current.set(resumen.id, {
          perfume: ficha,
          verificadoEn: Date.now(),
        });
        setDetalle((actual) =>
          actual?.id === resumen.id ? fusionarDetalle(actual, ficha) : actual
        );
        setErrorDetalle(null);
      } catch (error) {
        if (controller.signal.aborted || numeroSolicitud !== detalleSolicitudRef.current) {
          return;
        }
        setErrorDetalle(
          error instanceof Error
            ? error.message
            : "No pudimos cargar la ficha completa."
        );
      } finally {
        if (numeroSolicitud === detalleSolicitudRef.current) {
          setDetalleCargando(false);
          if (detalleAbortRef.current === controller) detalleAbortRef.current = null;
        }
      }
    })();
  }, []);

  const abrirDetalle = useCallback(
    (p: Perfume | null) => {
      if (p) {
        cargarDetalle(p);
        return;
      }
      detalleAbortRef.current?.abort();
      detalleAbortRef.current = null;
      detalleSolicitudRef.current += 1;
      setDetalle(null);
      setDetalleCargando(false);
      setErrorDetalle(null);
    },
    [cargarDetalle]
  );

  const reintentarDetalle = useCallback(() => {
    if (detalle) cargarDetalle(detalle, true);
  }, [cargarDetalle, detalle]);

  useEffect(
    () => () => {
      detalleAbortRef.current?.abort();
    },
    []
  );

  // Un modal puede quedar abierto mientras llega un refresh. Mantener su objeto
  // enlazado a la fila vigente evita agregar al carrito un precio/stock anterior
  // y fusionar conserva las notas/SKU que ya llegaron bajo demanda.
  useEffect(() => {
    if (!catalogoValido) return;
    const porId = new Map(perfumes.map((perfume) => [perfume.id, perfume]));
    setDetalle((actual) => {
      if (!actual) return null;
      const vigente = porId.get(actual.id);
      return vigente ? fusionarDetalle(vigente, actual) : null;
    });
  }, [catalogoValido, perfumes]);

  const catalogoListoParaComprar = catalogoValido
    && catalogoVerificadoEn != null
    && ahora - catalogoVerificadoEn <= 10 * 60 * 1000;

  // DEEP-LINK: si la URL trae ?perfume=<id> (link COMPARTIDO), abrir ese perfume
  // una vez, en cuanto el catálogo terminó de cargar.
  const deepLinkHecho = useRef(false);
  useEffect(() => {
    if (deepLinkHecho.current || !cargado || perfumes.length === 0) return;
    deepLinkHecho.current = true;
    const id = new URLSearchParams(window.location.search).get("perfume");
    if (id) {
      const p = perfumes.find((x) => x.id === id);
      if (p) abrirDetalle(p);
    }
  }, [abrirDetalle, cargado, perfumes]);

  const value = useMemo(
    () => ({
      perfumes,
      detalle,
      abrirDetalle,
      detalleCargando,
      errorDetalle,
      reintentarDetalle,
      recargar,
      cargado,
      catalogoValido,
      catalogoVerificadoEn,
      catalogoListoParaComprar,
      verificando,
      errorCatalogo,
    }),
    [
      perfumes,
      detalle,
      abrirDetalle,
      detalleCargando,
      errorDetalle,
      reintentarDetalle,
      recargar,
      cargado,
      catalogoValido,
      catalogoVerificadoEn,
      catalogoListoParaComprar,
      verificando,
      errorCatalogo,
    ]
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog debe usarse dentro de <CatalogProvider>");
  }
  return ctx;
}
