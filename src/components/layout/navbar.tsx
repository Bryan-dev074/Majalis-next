"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ShoppingBag, Menu, X, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useCart } from "@/hooks/use-cart";
import { Perfume } from "@/types/database";
import { formatGs, precioEfectivo } from "@/lib/format";

interface NavbarProps {
  perfumes: Perfume[];
  onSeleccionarPerfume: (p: Perfume) => void;
}

/**
 * Navbar flotante de ultra-lujo.
 * Cambia su opacidad/fondo al hacer scroll, sin perder la lectura premium.
 *
 * Búsqueda con autocompletado:
 *  · Al escribir aparecen sugerencias en vivo (top 6) por nombre / marca.
 *  · Clic en una sugerencia → abre el modal del perfume.
 *  · Enter o clic en la lupa → filtra el catálogo y hace scroll a la sección.
 *  · También dispara el evento global `sultan:search` que escucha el catálogo.
 */
export function Navbar({ perfumes, onSeleccionarPerfume }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuMobile, setMenuMobile] = useState(false);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { cantidadTotal, setAbrirCart } = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cinta "100% originales": aparece un instante al cargar y se guarda sola con
  // animación (en el teléfono ocupaba espacio todo el tiempo y se veía mal).
  // 3,5s en pantalla (2,2s era muy poco — pedido del dueño 03-jul) y además se
  // oculta apenas el visitante scrollea un poco hacia abajo.
  const [cintaVisible, setCintaVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setCintaVisible(false), 3500);
    const onScroll = () => {
      if (window.scrollY > 60) setCintaVisible(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setSugerenciasAbiertas(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const irA = (id: string) => {
    setMenuMobile(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Sugerencias en vivo (máx 6)
  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return perfumes
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.marca.toLowerCase().includes(q) ||
          p.categoria.some((c) => c.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [query, perfumes]);

  const emitirBusqueda = (q: string) => {
    window.dispatchEvent(new CustomEvent("sultan:search", { detail: q }));
  };

  const enviarBusqueda = (q: string) => {
    setQuery(q);
    if (q.trim().length > 1) {
      emitirBusqueda(q);
      document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
      setSugerenciasAbiertas(false);
    }
  };

  const seleccionarSugerencia = (p: Perfume) => {
    setQuery("");
    setSugerenciasAbiertas(false);
    setHighlightIndex(-1);
    onSeleccionarPerfume(p);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!sugerenciasAbiertas || sugerencias.length === 0) {
      if (e.key === "Enter") enviarBusqueda(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < sugerencias.length) {
        seleccionarSugerencia(sugerencias[highlightIndex]);
      } else {
        enviarBusqueda(query);
      }
    } else if (e.key === "Escape") {
      setSugerenciasAbiertas(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 z-50 w-full transition-all duration-500 ${
        scrolled
          ? "bg-obsidian/80 backdrop-blur-xl border-b border-gold/10"
          : "bg-transparent"
      }`}
    >
      {/* Cinta superior — sello de autenticidad. Aparece unos segundos al cargar y
          se guarda sola (max-h + opacity animados) para no ocupar espacio en móvil. */}
      <div
        className={`overflow-hidden transition-all duration-700 ease-in-out ${
          cintaVisible ? "max-h-10 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex items-center justify-center border-b border-gold/20 bg-obsidian/85 px-4 py-1.5 backdrop-blur-md">
          <p className="text-center text-[0.58rem] font-bold uppercase tracking-imperial text-gold drop-shadow-[0_0_10px_rgba(212,175,55,0.55)] md:text-[0.65rem]">
            ✦ Perfumes 100% originales · Envío a todo el país ✦
          </p>
        </div>
      </div>
      {/* En móvil: flex borde a borde (marca izquierda, botones derecha). En md+: grid con centro. */}
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 transition-all duration-500 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-10 ${
          scrolled ? "py-3" : "py-4 md:py-6"
        }`}
      >
        {/* Marca — forzada a la esquina izquierda */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="group flex flex-col items-start justify-self-start"
          aria-label="Inicio Sultan Oud Elixir"
        >
          <span className="font-lapidary text-lg md:text-2xl tracking-regal text-ivory drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors group-hover:text-gold-champagne">
            SULTAN OUD
          </span>
          <span className="font-display text-base font-semibold italic tracking-imperial text-elixir-shimmer drop-shadow-[0_0_10px_rgba(212,175,55,0.4)] md:text-lg">
            Elixir
          </span>
        </button>

        {/* Centro — navegación desktop */}
        <div className="hidden items-center gap-10 justify-self-center md:flex">
          {[
            { label: "Colección", id: "catalogo" },
            { label: "Importación", id: "importacion" },
            { label: "Favoritos", id: "favoritos" },
            { label: "Atelier", id: "atelier" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => irA(item.id)}
              className="group relative text-[0.7rem] uppercase tracking-regal text-ivory/70 transition-colors hover:text-gold-champagne"
            >
              {item.label}
              <span className="absolute -bottom-2 left-0 h-px w-0 bg-gold transition-all duration-500 group-hover:w-full" />
            </button>
          ))}
        </div>

        {/* Derecha — búsqueda, carrito, menú mobile */}
        <div className="flex items-center justify-end gap-4 justify-self-end md:gap-6">
          {/* Búsqueda expandible con autocompletado */}
          <div className="relative flex items-center gap-2" ref={contenedorRef}>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSugerenciasAbiertas(e.target.value.trim().length > 0);
                setHighlightIndex(-1);
                // Búsqueda reactiva en el catálogo
                emitirBusqueda(e.target.value);
              }}
              onFocus={() => {
                setSearchOpen(true);
                if (query.trim()) setSugerenciasAbiertas(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="Buscar fragancia…"
              className={`bg-transparent text-sm text-ivory placeholder:text-ivory/30 transition-all duration-500 ease-out border-b border-gold/30 focus:outline-none focus:border-gold ${
                searchOpen
                  ? "w-40 md:w-64 px-2 py-1 opacity-100"
                  : "w-0 opacity-0 px-0"
              }`}
            />
            <button
              onClick={() => {
                if (searchOpen && query.trim()) {
                  enviarBusqueda(query);
                } else {
                  setSearchOpen((v) => !v);
                }
              }}
              className="text-ivory/70 transition-colors hover:text-gold-champagne"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" strokeWidth={1.25} />
            </button>

            {/* Dropdown de sugerencias en vivo */}
            {sugerenciasAbiertas && sugerencias.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-sm border border-gold/20 bg-obsidian/98 shadow-[0_20px_60px_-15px_rgba(212,175,55,0.4)] backdrop-blur-2xl md:w-80">
                {sugerencias.map((p, i) => {
                  const precio = precioEfectivo(p);
                  return (
                    <button
                      key={p.id}
                      onMouseEnter={() => setHighlightIndex(i)}
                      onClick={() => seleccionarSugerencia(p)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        i === highlightIndex
                          ? "bg-gold/10"
                          : "hover:bg-gold/5"
                      }`}
                    >
                      <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-sm bg-coal">
                        <Image
                          src={p.url_imagen}
                          alt={p.nombre}
                          fill
                          sizes="40px"
                          className="object-cover object-top"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm text-ivory">
                          {p.nombre}
                        </p>
                        <p className="text-[0.6rem] uppercase tracking-regal text-gold/70">
                          {p.marca}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-xs text-gold-gradient">
                          {formatGs(precio)}
                        </p>
                        <ArrowRight className="ml-auto mt-1 h-3 w-3 text-ivory/40" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Carrito */}
          <button
            onClick={() => setAbrirCart(true)}
            className="relative text-ivory/80 transition-colors hover:text-gold-champagne"
            aria-label="Abrir carrito"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.25} />
            {cantidadTotal > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-dark px-1 text-[0.55rem] font-semibold text-obsidian animate-scale-in">
                {cantidadTotal}
              </span>
            )}
          </button>

          {/* Menú mobile */}
          <button
            onClick={() => setMenuMobile((v) => !v)}
            className="text-ivory/80 md:hidden"
            aria-label="Menú"
          >
            {menuMobile ? (
              <X className="h-5 w-5" strokeWidth={1.25} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.25} />
            )}
          </button>
        </div>
      </div>

      {/* Menú mobile desplegable */}
      {menuMobile && (
        <div className="absolute top-full left-0 w-full bg-obsidian/95 backdrop-blur-xl border-b border-gold/10 md:hidden">
          <div className="flex flex-col px-6 py-4">
            {[
              { label: "Colección", id: "catalogo" },
              { label: "Importación", id: "importacion" },
              { label: "Favoritos", id: "favoritos" },
              { label: "Atelier", id: "atelier" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => irA(item.id)}
                className="py-3 text-left text-sm uppercase tracking-regal text-ivory/80 border-b border-gold/5 last:border-0"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
