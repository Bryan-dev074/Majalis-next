"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchX, X, Search, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, SprayCan, Gem, FlaskConical, Wind, Gift, Crown, type LucideIcon } from "lucide-react";
import { Perfume } from "@/types/database";
import { ProductCard } from "@/components/catalog/product-card";
import { useReveal } from "@/hooks/use-reveal";
import { buildWaLink } from "@/data/site-config";
import { coincideBusqueda, normalizarBusqueda } from "@/lib/format";
import { CATEGORIAS_TIENDA, CategoriaId, enCategoria, labelResultados } from "@/lib/categorias";

/** Icono de cada vitrina (el medallón "respira" con un brillo dorado constante). */
const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  todas: LayoutGrid,
  perfume: SprayCan,
  nicho: Gem,
  mini: FlaskConical,
  deo: Wind,
  kit: Gift,
  premium: Crown,
};

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
const POR_PAGINA = 24; // múltiplo de 2/3/4 → completa las filas del grid en todos los tamaños
const MARCAS_VISIBLES = 12; // pills que se muestran sin expandir

export function Catalogo({ perfumes, query, onQueryChange, onAbrirDetalle }: CatalogoProps) {
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaId>("todas");
  const [marcaActiva, setMarcaActiva] = useState<string>("todas");
  const [familiaActiva, setFamiliaActiva] = useState<string>("todas");
  const [marcasAbiertas, setMarcasAbiertas] = useState(false);
  const [marcaBusqueda, setMarcaBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
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

  // ── Categorías (Perfumes / Nicho / Miniaturas / Desodorantes / Kits) ──
  // Conteos sobre el catálogo completo; solo se muestran las que tienen stock.
  const categorias = useMemo(() => {
    return CATEGORIAS_TIENDA
      .map((c) => ({ ...c, n: perfumes.filter((p) => enCategoria(p, c.id)).length }))
      .filter((c) => c.n > 0);
  }, [perfumes]);

  // Subconjunto de la categoría activa: las marcas/familias/resultados se
  // derivan de ACÁ (en "Kits" solo se listan casas que tienen kits).
  const enCat = useMemo(
    () => perfumes.filter((p) => enCategoria(p, categoriaActiva)),
    [perfumes, categoriaActiva]
  );

  const cambiarCategoria = (id: CategoriaId) => {
    setCategoriaActiva((prev) => (prev === id ? "todas" : id));
    // La marca/familia elegida puede no existir en la otra categoría → reset.
    setMarcaActiva("todas");
    setFamiliaActiva("todas");
  };

  // Marcas derivadas de los datos reales. MISMA lógica que el marquee de casas
  // perfumistas (trim + descarta vacíos + orden localizado) → el conteo coincide
  // SIEMPRE en los dos lugares (antes: catálogo 105 vs marquee 110).
  const marcas = useMemo(() => {
    const set = new Set<string>();
    for (const p of enCat) {
      const m = p.marca?.trim();
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [enCat]);

  // Familias olfativas derivadas (todas las categorías excepto las que son marca)
  const familias = useMemo(() => {
    const set = new Set<string>();
    const marcasSet = new Set(marcas.map((m) => m.toLowerCase()));
    enCat.forEach((p) => {
      p.categoria.forEach((c) => {
        if (!marcasSet.has(c.toLowerCase())) set.add(c);
      });
    });
    return Array.from(set).sort();
  }, [enCat, marcas]);

  const filtrados = useMemo(() => {
    return enCat
      .filter((p) => {
        const matchMarca = marcaActiva === "todas" || p.marca === marcaActiva;
        const matchFamilia =
          familiaActiva === "todas" || p.categoria.includes(familiaActiva);
        // Búsqueda por TOKENS (marca + nombre + descripción, sin acentos):
        // "armaf club de nuit int" encuentra el Club de Nuit aunque la frase
        // completa no esté en ninguna columna sola.
        return matchMarca && matchFamilia && coincideBusqueda(p, query);
      })
      // ORDEN: primero los DESTACADOS (la estrellita del panel /admin manda),
      // después los más buscados (clicks_mensuales = veces que abrieron el
      // detalle), y de último alfabético por marca.
      .sort((a, b) => {
        if (a.destacado !== b.destacado) return a.destacado ? -1 : 1;
        const clicksA = a.clicks_mensuales ?? 0;
        const clicksB = b.clicks_mensuales ?? 0;
        if (clicksB !== clicksA) return clicksB - clicksA;
        return a.marca.localeCompare(b.marca, "es");
      });
  }, [enCat, marcaActiva, familiaActiva, query]);

  const hayFiltros =
    categoriaActiva !== "todas" ||
    marcaActiva !== "todas" ||
    familiaActiva !== "todas" ||
    query.trim().length > 0;

  const limpiar = () => {
    setCategoriaActiva("todas");
    setMarcaActiva("todas");
    setFamiliaActiva("todas");
    onQueryChange("");
  };

  // ── Buscador de marcas (con 100+ casas, la lista se vuelve inmanejable) ──
  const marcasFiltradas = useMemo(() => {
    const q = normalizarBusqueda(marcaBusqueda);
    return q ? marcas.filter((m) => normalizarBusqueda(m).includes(q)) : marcas;
  }, [marcas, marcaBusqueda]);

  // Colapsado: primeras N + la marca activa (para que siempre se vea seleccionada).
  const marcasColapsadas = useMemo(() => {
    const base = marcas.slice(0, MARCAS_VISIBLES);
    if (marcaActiva !== "todas" && marcas.includes(marcaActiva) && !base.includes(marcaActiva)) {
      return [marcaActiva, ...base.slice(0, MARCAS_VISIBLES - 1)];
    }
    return base;
  }, [marcas, marcaActiva]);

  // ── Paginación del grid (evita renderizar ~1.800 tarjetas de golpe) ──
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice(
    (paginaSegura - 1) * POR_PAGINA,
    paginaSegura * POR_PAGINA
  );

  // Al cambiar cualquier filtro, volvemos a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [categoriaActiva, marcaActiva, familiaActiva, query]);

  const irAPagina = (n: number) => {
    const destino = Math.min(Math.max(1, n), totalPaginas);
    setPagina(destino);
    // Subir al inicio del catálogo para no quedar perdido a mitad de página.
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Números a mostrar: 1 … (p-1) [p] (p+1) … último (con elipsis).
  const numerosPagina = useMemo<(number | "…")[]>(() => {
    const total = totalPaginas;
    const actual = paginaSegura;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const nums = new Set<number>([1, total, actual, actual - 1, actual + 1]);
    const orden = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    let prev = 0;
    for (const n of orden) {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }, [totalPaginas, paginaSegura]);

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
          {/* CATEGORÍAS — cabecera editorial (12-jul v3): navegación
              tipográfica al estilo de las casas de lujo — mayúsculas
              espaciadas, separadores hairline, conteo en superíndice dorado
              y subrayado dorado que crece bajo la activa. El icono respira
              apenas (solo opacidad). Sin cajas, sin brillos: el lujo es aire. */}
          {categorias.length > 1 && (
            <div className="space-y-1">
              <p className="eyebrow justify-center !text-[0.6rem]">Explorá la colección</p>
              <nav className="colecciones" role="tablist" aria-label="Categorías de la colección">
                <div className="colecciones-fila">
                  {[{ id: "todas" as CategoriaId, label: "Todos", n: perfumes.length }, ...categorias].map((c, i) => {
                    const Icono = ICONO_CATEGORIA[c.id] ?? LayoutGrid;
                    const activa = categoriaActiva === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => cambiarCategoria(c.id)}
                        className={`coleccion ${activa ? "is-active" : ""}`}
                        role="tab"
                        aria-selected={activa}
                        style={{ ["--resp-delay" as string]: `${i * 0.5}s` }}
                      >
                        <Icono className="coleccion-icono" strokeWidth={1.3} aria-hidden />
                        <span className="coleccion-label">{c.label}</span>
                        <span className="coleccion-n">{c.n.toLocaleString("es-PY")}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            </div>
          )}

          {/* Buscador GENERAL de perfumes — siempre visible. Mismo estado `query`
              que el buscador del navbar (los dos filtran el grid por tokens). */}
          <div className="relative mx-auto max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-gold/60" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Buscá tu perfume — nombre o marca…"
              aria-label="Buscar perfume"
              className="w-full rounded-full border border-gold/25 bg-obsidian/70 py-3 pl-11 pr-10 text-[0.95rem] text-ivory placeholder:text-ivory/35 outline-none transition-colors focus:border-gold/60"
            />
            {query && (
              <button
                onClick={() => onQueryChange("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ivory/40 transition-colors hover:text-gold"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Marcas — pestañas horizontales. A la derecha, EL DATO: cuántos hay hoy. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="eyebrow !justify-start !text-[0.62rem] !text-gold/90 !opacity-100">Casas perfumistas</p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-regal text-ivory/45">
                <span className="text-gold-gradient font-display text-base font-semibold tabular-nums">
                  {enCat.length.toLocaleString("es-PY")}
                </span>{" "}
                {categoriaActiva === "todas" ? "productos disponibles hoy" : `${labelResultados(categoriaActiva, enCat.length)} disponibles hoy`}
              </p>
            </div>
            {/* Buscador de marca — visible al expandir (con 100+ casas hace falta) */}
            {marcasAbiertas && marcas.length > MARCAS_VISIBLES && (
              <div className="relative max-w-xs">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/50" strokeWidth={1.5} />
                <input
                  type="text"
                  value={marcaBusqueda}
                  onChange={(e) => setMarcaBusqueda(e.target.value)}
                  placeholder="Buscá una casa perfumista…"
                  aria-label="Buscar marca"
                  className="w-full rounded-full border border-gold/25 bg-obsidian/70 py-2.5 pl-10 pr-9 text-sm text-ivory placeholder:text-ivory/35 outline-none transition-colors focus:border-gold/60"
                />
                {marcaBusqueda && (
                  <button
                    onClick={() => setMarcaBusqueda("")}
                    aria-label="Limpiar búsqueda de marca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory/40 transition-colors hover:text-gold"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}

            {/* Pills de marca. Colapsado: pocas + activa. Expandido: todas (scroll). */}
            <div className={`flex flex-wrap gap-2 ${marcasAbiertas ? "max-h-56 overflow-y-auto pr-1" : ""}`}>
              <button
                onClick={() => setMarcaActiva("todas")}
                className={`filter-pill ${marcaActiva === "todas" ? "is-active" : ""}`}
              >
                Todas
              </button>
              {(marcasAbiertas ? marcasFiltradas : marcasColapsadas).map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    setMarcaActiva((prev) => (prev === m ? "todas" : m))
                  }
                  className={`filter-pill capitalize ${marcaActiva === m ? "is-active" : ""}`}
                >
                  {m}
                </button>
              ))}
              {marcasAbiertas && marcasFiltradas.length === 0 && (
                <p className="px-2 py-1 text-sm text-ivory/45">Ninguna marca coincide con “{marcaBusqueda}”.</p>
              )}
            </div>

            {/* Botón para expandir/colapsar todas las marcas */}
            {marcas.length > MARCAS_VISIBLES && (
              <button
                onClick={() => { setMarcasAbiertas((v) => !v); setMarcaBusqueda(""); }}
                className="brand-toggle"
                aria-expanded={marcasAbiertas}
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
                {marcasAbiertas ? "Ver menos" : `Ver todas las ${marcas.length} marcas`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${marcasAbiertas ? "rotate-180" : ""}`} strokeWidth={1.5} />
              </button>
            )}
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
              {filtrados.length} {labelResultados(categoriaActiva, filtrados.length)}
              {totalPaginas > 1 && (
                <span className="text-ivory/30"> · pág. {paginaSegura} de {totalPaginas}</span>
              )}
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
          <>
            {/* key={paginaSegura} → cada cambio de página re-dispara la animación de entrada */}
            <div
              key={paginaSegura}
              className="catalogo-page grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 xl:grid-cols-4"
            >
              {visibles.map((p) => (
                <ProductCard
                  key={p.id}
                  perfume={p}
                  onAbrirDetalle={onAbrirDetalle}
                />
              ))}
            </div>

            {/* Paginación — elegante, dorada, con anterior/siguiente + números */}
            {totalPaginas > 1 && (
              <nav
                aria-label="Paginación del catálogo"
                className="mt-14 flex flex-wrap items-center justify-center gap-2"
              >
                <button
                  onClick={() => irAPagina(paginaSegura - 1)}
                  disabled={paginaSegura === 1}
                  aria-label="Página anterior"
                  className="page-btn"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                </button>

                {numerosPagina.map((n, i) =>
                  n === "…" ? (
                    <span key={`e${i}`} className="page-ellipsis">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => irAPagina(n)}
                      aria-label={`Página ${n}`}
                      aria-current={n === paginaSegura ? "page" : undefined}
                      className={`page-btn ${n === paginaSegura ? "is-active" : ""}`}
                    >
                      {n}
                    </button>
                  )
                )}

                <button
                  onClick={() => irAPagina(paginaSegura + 1)}
                  disabled={paginaSegura === totalPaginas}
                  aria-label="Página siguiente"
                  className="page-btn"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
