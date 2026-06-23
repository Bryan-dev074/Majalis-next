"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchX, X, Zap } from "lucide-react";
import { Perfume } from "@/types/database";
import { ProductCard } from "@/components/catalog/product-card";
import { useReveal } from "@/hooks/use-reveal";

interface CatalogoProps {
  perfumes: Perfume[];
  query: string;
  onQueryChange: (q: string) => void;
  onAbrirDetalle: (p: Perfume) => void;
}

/**
 * Catálogo principal.
 *
 * Cámara olfativa rediseñada — más interactiva y estética:
 *  · Marcas como pestañas horizontales (scroll suave en móvil).
 *  · Familias olfativas como chips selectivos.
 *  · Contador de resultados en vivo.
 *  · Botón "Limpiar" visible solo cuando hay filtros activos.
 *  · Las marcas/familias nuevas aparecen automáticamente cuando agregás
 *    un perfume con una marca o categoría que no existía.
 *
 * Escucha el evento global `sultan:search` que dispara el Navbar.
 */
export function Catalogo({ perfumes, query, onQueryChange, onAbrirDetalle }: CatalogoProps) {
  const [marcaActiva, setMarcaActiva] = useState<string>("todas");
  const [familiaActiva, setFamiliaActiva] = useState<string>("todas");
  const [ofertasExpress, setOfertasExpress] = useState<boolean>(false);
  const ref = useReveal<HTMLDivElement>({ stagger: 0.04, y: 24 });

  // Escuchar búsqueda global del navbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail ?? "";
      onQueryChange(detail);
    };
    window.addEventListener("sultan:search", handler);
    return () => window.removeEventListener("sultan:search", handler);
  }, [onQueryChange]);

  // Marcas derivadas de los datos reales
  const marcas = useMemo(() => {
    const set = new Set<string>();
    perfumes.forEach((p) => set.add(p.marca));
    return Array.from(set).sort();
  }, [perfumes]);

  // Familias olfativas derivadas (todas las categorías excepto las que son marca)
  const familias = useMemo(() => {
    const set = new Set<string>();
    const marcasSet = new Set(marcas.map((m) => m.toLowerCase()));
    perfumes.forEach((p) => {
      p.categoria.forEach((c) => {
        if (!marcasSet.has(c.toLowerCase())) set.add(c);
      });
    });
    return Array.from(set).sort();
  }, [perfumes, marcas]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return perfumes.filter((p) => {
      const matchMarca = marcaActiva === "todas" || p.marca === marcaActiva;
      const matchFamilia =
        familiaActiva === "todas" || p.categoria.includes(familiaActiva);
      // "Envío Inmediato": SOLO productos locales (es_dropi=false).
      // No exige que estén en oferta — es el botón de los productos de entrega express.
      const esLocal =
        !p.es_dropi && !(p.sku?.startsWith("DROPI-") ?? false);
      const matchOferta = !ofertasExpress || esLocal;
      const matchQuery =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q);
      return matchMarca && matchFamilia && matchOferta && matchQuery;
    });
  }, [perfumes, marcaActiva, familiaActiva, ofertasExpress, query]);

  const hayFiltros =
    marcaActiva !== "todas" ||
    familiaActiva !== "todas" ||
    query.trim().length > 0 ||
    ofertasExpress;

  const limpiar = () => {
    setMarcaActiva("todas");
    setFamiliaActiva("todas");
    setOfertasExpress(false);
    onQueryChange("");
  };

  return (
    <section
      id="catalogo"
      ref={ref}
      className="relative z-10 bg-ebony/70 px-6 py-24 backdrop-blur-md md:py-32"
    >
      <div className="mx-auto max-w-7xl">
        {/* Encabezado */}
        <div className="mb-12 text-center" data-reveal>
          <p className="eyebrow justify-center">Catálogo oficial</p>
          <h2 className="mt-5 font-display text-4xl text-ivory md:text-6xl">
            La cámara olfativa
          </h2>
          <div className="gold-rule mx-auto mt-6" />
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-ivory/55">
            Encuentra tu firma olfativa entre los elixires más exclusivos
            del mundo árabe. Cada botella llega desde Dubai con autenticidad garantizada.
          </p>
        </div>

        {/* Botón destacado: Envío Inmediato */}
        <div className="mb-5 flex justify-center" data-reveal>
          <button
            onClick={() => {
              setOfertasExpress((v) => !v);
              // Al activarse, limpiar marca/familia para que el foco quede en envío inmediato
              if (!ofertasExpress) {
                setMarcaActiva("todas");
                setFamiliaActiva("todas");
              }
            }}
            className={`group relative overflow-hidden rounded-full border-2 px-6 py-3.5 text-xs font-bold uppercase tracking-regal transition-all duration-500 sm:px-8 sm:py-4 sm:text-sm ${
              ofertasExpress
                ? "border-[#25D366] bg-gradient-to-r from-[#1faa52] to-[#25D366] text-obsidian shadow-[0_0_50px_-8px_rgba(37,211,102,0.9)]"
                : "express-idle-beat border-[#d4af37] bg-gradient-to-r from-gold-dark via-gold to-gold-light text-obsidian hover:shadow-[0_0_60px_-8px_rgba(212,175,55,0.95)]"
            }`}
            aria-pressed={ofertasExpress}
          >
            {/* Brillo continuo cuando está activo (sweep infinito) */}
            <span
              className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent ${
                ofertasExpress
                  ? "express-active-sweep"
                  : "-translate-x-full transition-transform duration-700 group-hover:translate-x-full"
              }`}
            />
            <span className="relative flex items-center gap-2 sm:gap-2.5">
              <Zap
                className={`h-4 w-4 sm:h-5 sm:w-5 ${ofertasExpress ? "express-active-zap" : "express-idle-zap"}`}
                fill={ofertasExpress ? "currentColor" : "none"}
                strokeWidth={2}
              />
              <span className="leading-tight">
                {ofertasExpress ? "Mostrando Envío Inmediato" : "Productos de Envío Inmediato"}
              </span>
              <Zap
                className={`h-4 w-4 sm:h-5 sm:w-5 ${ofertasExpress ? "express-active-zap" : "express-idle-zap"}`}
                fill={ofertasExpress ? "currentColor" : "none"}
                strokeWidth={2}
              />
            </span>
          </button>
        </div>
        <p
          className={`mb-10 text-center text-[0.66rem] uppercase tracking-regal transition-colors duration-300 sm:text-xs ${
            ofertasExpress ? "text-[#25D366]/90" : "text-ivory/60"
          }`}
        >
          {ofertasExpress
            ? "Viendo solo los productos con entrega express"
            : "Tocá para ver solo los productos con entrega express ⚡"}
        </p>

        {/* ────────── Filtros rediseñados ────────── */}
        <div className="mb-10 space-y-6" data-reveal>
          {/* Marcas — pestañas horizontales */}
          <div className="space-y-3">
            <p className="eyebrow !justify-start !text-[0.55rem] opacity-70">Casas perfumistas</p>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setMarcaActiva("todas")}
                className={`filter-pill shrink-0 ${marcaActiva === "todas" ? "is-active" : ""}`}
              >
                Todas
              </button>
              {marcas.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    setMarcaActiva((prev) => (prev === m ? "todas" : m))
                  }
                  className={`filter-pill shrink-0 capitalize ${marcaActiva === m ? "is-active" : ""}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Familias olfativas — chips selectivos */}
          {familias.length > 0 && (
            <div className="space-y-3">
              <p className="eyebrow !justify-start !text-[0.55rem] opacity-70">Familias olfativas</p>
              <div className="flex flex-wrap gap-2">
                {familias.map((f) => (
                  <button
                    key={f}
                    onClick={() =>
                      setFamiliaActiva((prev) => (prev === f ? "todas" : f))
                    }
                    className={`filter-pill capitalize ${familiaActiva === f ? "is-active" : ""}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contador + limpiar */}
          <div className="flex items-center justify-between border-t border-gold/10 pt-4">
            <p className="text-[0.65rem] uppercase tracking-regal text-ivory/45">
              {filtrados.length} {filtrados.length === 1 ? "fragancia" : "fragancias"}
            </p>
            {hayFiltros && (
              <button
                onClick={limpiar}
                className="inline-flex items-center gap-1.5 text-[0.6rem] uppercase tracking-regal text-gold/70 transition-colors hover:text-gold-champagne"
              >
                <X className="h-3 w-3" strokeWidth={2} />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        {perfumes.length === 0 ? (
          // Catálogo realmente vacío (todavía no hay productos activos).
          <div className="flex flex-col items-center py-20 text-center text-ivory/40">
            <SearchX className="mb-4 h-10 w-10 opacity-40" strokeWidth={1} />
            <p className="text-sm">Estamos preparando nuestro catálogo.</p>
            <p className="mt-2 max-w-xs text-xs text-ivory/30">
              Muy pronto vas a encontrar aquí nuestras fragancias exclusivas.
            </p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-ivory/40">
            <SearchX className="mb-4 h-10 w-10 opacity-40" strokeWidth={1} />
            <p className="text-sm">
              No encontramos fragancias con esos criterios.
            </p>
            <button
              onClick={limpiar}
              className="mt-4 text-xs uppercase tracking-regal text-gold/70 underline-offset-4 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((p) => (
              <ProductCard
                key={p.id}
                perfume={p}
                onAbrirDetalle={onAbrirDetalle}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
