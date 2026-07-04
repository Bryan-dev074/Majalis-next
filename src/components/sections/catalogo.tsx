"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { Perfume } from "@/types/database";
import { ProductCard } from "@/components/catalog/product-card";
import { useReveal } from "@/hooks/use-reveal";
import { buildWaLink } from "@/data/site-config";

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

  // Clic en una marca del explorador (cinta de casas perfumistas) → activa el
  // FILTRO DE MARCA acá (limpiando texto y familia). Si esa marca no está en
  // stock, se ve el aviso de WhatsApp del estado sin-resultados.
  useEffect(() => {
    const handler = (e: Event) => {
      const marca = (e as CustomEvent<string>).detail ?? "todas";
      onQueryChange("");
      setFamiliaActiva("todas");
      setMarcaActiva(marca);
    };
    window.addEventListener("majalis:filtrar-marca", handler);
    return () => window.removeEventListener("majalis:filtrar-marca", handler);
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
      const matchQuery =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q);
      return matchMarca && matchFamilia && matchQuery;
    });
  }, [perfumes, marcaActiva, familiaActiva, query]);

  const hayFiltros =
    marcaActiva !== "todas" ||
    familiaActiva !== "todas" ||
    query.trim().length > 0;

  const limpiar = () => {
    setMarcaActiva("todas");
    setFamiliaActiva("todas");
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

        {/* ────────── Filtros rediseñados ────────── */}
        <div className="mb-10 space-y-6" data-reveal>
          {/* Marcas — pestañas horizontales. A la derecha, EL DATO: cuántos hay hoy. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="eyebrow !justify-start !text-[0.62rem] !text-gold/90 !opacity-100">Casas perfumistas</p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-regal text-ivory/45">
                <span className="text-gold-gradient font-display text-base font-semibold tabular-nums">
                  {perfumes.length.toLocaleString("es-PY")}
                </span>{" "}
                perfumes disponibles hoy
              </p>
            </div>
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
          <div className="flex flex-col items-center px-4 py-20 text-center text-ivory/40">
            <SearchX className="mb-4 h-10 w-10 opacity-40" strokeWidth={1} />
            <p className="text-sm text-ivory/60">
              {marcaActiva !== "todas"
                ? `Todavía no tenemos ${marcaActiva} en stock.`
                : "No encontramos fragancias con esos criterios."}
            </p>
            {/* Aviso de WhatsApp — solo cuando el cliente no encuentra lo que busca */}
            <p className="mt-3 max-w-md text-balance text-base font-light leading-relaxed text-ivory/75">
              ¿Lo querés igual?{" "}
              <a
                href={buildWaLink(
                  marcaActiva !== "todas"
                    ? `Hola Majalis! ¿Tenés algo de ${marcaActiva}? Quiero consultar stock 🙌`
                    : "Hola Majalis! Busco un perfume y no lo veo en la web, ¿me ayudás? 🙌"
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="wa-link whitespace-nowrap"
              >
                Escribinos por WhatsApp
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="wa-latido ml-1.5 inline h-[1em] w-[1em] fill-[#25d366]"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
              </a>
            </p>
            <button
              onClick={limpiar}
              className="mt-6 text-xs uppercase tracking-regal text-gold/70 underline-offset-4 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 xl:grid-cols-4">
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
