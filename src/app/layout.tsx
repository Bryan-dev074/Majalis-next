import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Jost } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@/styles/globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Majalis · Perfumes Árabes de Ultra-Lujo en Paraguay",
  description:
    "Importación directa de Dubai. La colección más exclusiva de fragancias árabes en Paraguay. Perfumes 100% originales · Envío a todo el país.",
  keywords: [
    "perfumes árabes",
    "oud",
    "Lattafa",
    "Armaf",
    "Afnan",
    "perfumes Paraguay",
    "fragancias de lujo",
    "importación Dubai",
  ],
  openGraph: {
    title: "Majalis",
    description:
      "Importación directa de Dubai · Perfumes 100% originales · Envío a todo el país",
    type: "website",
    locale: "es_PY",
  },
  metadataBase: new URL("https://sulta-oud-elixir.vercel.app"),
};

/**
 * Layout raíz — solo define <html>/<body> y las fuentes.
 * Cada route group ((tienda) / (admin)) tiene su propio layout con su chrome.
 * ⚠️ <Analytics/> y <SpeedInsights/> van SOLO acá: montarlos también en los
 * layouts de los route groups duplicaría el tracking de cada visita.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${cinzel.variable} ${cormorant.variable} ${jost.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
