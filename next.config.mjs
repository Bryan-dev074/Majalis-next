/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "fimgs.net" },
      { protocol: "https", hostname: "cdn.notinoimg.com" },
    ],
  },
  // Three.js y GSAP pesan; dejamos que Next los divida automáticamente.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
