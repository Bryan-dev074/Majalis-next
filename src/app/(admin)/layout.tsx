import "@/styles/admin.css";

/**
 * Layout del panel de administración.
 * Tema claro, alto contraste, sin el chrome premium de la tienda.
 * Usa su propia hoja de estilos (admin.css) y sobreescribe el fondo oscuro.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-root min-h-screen">{children}</div>;
}
