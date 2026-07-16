/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // ⚠️ LÍMITE DE TRANSFORMACIONES DE VERCEL (Hobby: 5.000/mes; al pasarlo las fotos
    // NUEVAS fallan con 402 y se ve el alt). Se factura por cada cache MISS, y aplica
    // TANTO a imágenes remotas COMO locales (no es "externa vs local": es si pasa o no
    // por el optimizador). Tres ajustes, los que recomienda la propia doc de Vercel:
    //
    // 1) minimumCacheTTL — EL GRANDE. Nuestras fotos de Supabase Storage sirven
    //    `cache-control: max-age=3600` (1 h) y el TTL efectivo es el MAYOR entre el
    //    header upstream y este valor → con el default se RE-TRANSFORMABA cada hora
    //    (un producto visto todo el día = ~720 transformaciones/mes él solo).
    //    Con 31 días: 1 transformación por foto/tamaño al mes.
    //    OJO: no hay invalidación de caché — si se reemplaza una foto en la MISMA ruta,
    //    la vieja puede verse hasta 31 días. Nuestro pipeline sube las mejoras con
    //    nombre nuevo (sufijo -hd), así que la URL cambia y no aplica.
    minimumCacheTTL: 2678400, // 31 días
    //
    // 2) Un solo formato: cada formato extra DUPLICA las transformaciones (una por
    //    Accept-header). WebP solo — AVIF pesa ~20% menos pero no vale el 2× de cuota.
    formats: ["image/webp"],
    //
    // 3) Menos anchos posibles = menos variantes. Nuestras fotos de origen miden
    //    ≤1000-1080px, así que pedir 1200/1920/2048/3840 solo las AGRANDA al pedo.
    deviceSizes: [640, 828, 1080],
    imageSizes: [64, 128, 256, 384],
    // (images.qualities es de Next 15+; en Next 14 no existe. No hace falta: ningún
    //  <Image> pasa `quality`, así que todas usan el default 75 = una sola variante.)
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "fimgs.net" },
      { protocol: "https", hostname: "cdn.notinoimg.com" },
      // Imágenes de producto subidas desde el panel (Supabase Storage, bucket "productos")
      { protocol: "https", hostname: "fpzmdezcmbyplbdngcke.supabase.co" },
    ],
  },
  // Three.js y GSAP pesan; dejamos que Next los divida automáticamente.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
