import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Jost } from "next/font/google";
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
  title: "Sultan Oud Elixir · Perfumes Árabes de Ultra-Lujo en Paraguay",
  description:
    "Importación directa de Dubai. La colección más exclusiva de fragancias árabes en Paraguay. Pago al recibir en todo el territorio nacional.",
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
    title: "Sultan Oud Elixir",
    description:
      "Importación directa de Dubai · Pago al recibir en todo Paraguay",
    type: "website",
    locale: "es_PY",
  },
  metadataBase: new URL("https://sultan-oud-next.vercel.app"),
};

/**
 * Layout raíz — solo define <html>/<body> y las fuentes.
 * Cada route group ((tienda) / (admin)) tiene su propio layout con su chrome.
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
