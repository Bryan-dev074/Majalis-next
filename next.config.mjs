/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // AVIF primero (soporte >95%): ~20-35% menos peso por foto que WebP, con
    // caída automática a WebP por Accept-header. Clave en redes móviles lentas.
    formats: ["image/avif", "image/webp"],
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
