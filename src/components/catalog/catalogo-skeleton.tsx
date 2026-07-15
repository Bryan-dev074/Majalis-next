/**
 * Skeleton premium de la cámara olfativa.
 *
 * Se muestra en el instante en que la home YA pintó pero el catálogo (que llega
 * de /api/catalogo del lado del cliente) todavía no resolvió. Antes ese hueco
 * mostraba el mensaje "Estamos preparando nuestro catálogo" (que es el estado
 * VACÍO, no el de carga) → parecía que no había productos.
 *
 * Rendimiento: es 100% CSS. El barrido dorado usa `transform: translateX` (clase
 * .skeleton-sweep en globals.css) → compositado por GPU, sin costo de hilo
 * principal ni JS. No agrega ni un byte de bundle nuevo (ni deps, ni estado).
 */
const CANT = 8; // 2-3 filas según el ancho — suficiente para llenar el hueco

export function CatalogoSkeleton() {
  return (
    <div aria-hidden="true">
      {/* Rótulo elegante, en el tono de la marca */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <span className="eyebrow !text-gold/70">Destilando la colección</span>
        <span className="relative block h-px w-40 overflow-hidden bg-smoke">
          <span className="skeleton-linea absolute inset-0 block" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: CANT }).map((_, i) => (
          <div
            key={i}
            className="glass-luxe relative flex flex-col overflow-hidden rounded-sm"
          >
            {/* Imagen (mismo aspecto 3:4 que la tarjeta real) */}
            <div className="skeleton-sweep relative aspect-[3/4] bg-coal" />
            {/* Info: nombre · categoría · precio */}
            <div className="flex flex-col items-center gap-2.5 p-3 sm:gap-3 sm:p-5">
              <span className="skeleton-sweep block h-4 w-3/4 rounded-sm bg-ivory/[0.06] sm:h-6" />
              <span className="skeleton-sweep block h-2.5 w-2/5 rounded-sm bg-ivory/[0.05]" />
              <span className="skeleton-sweep mt-2 block h-6 w-1/2 rounded-sm bg-gold/[0.08] sm:h-7" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
