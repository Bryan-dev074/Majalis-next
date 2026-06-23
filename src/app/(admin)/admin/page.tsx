import { cargarDatosAdmin } from "./actions";
import { sesionValida } from "@/lib/supabase-admin";
import AdminClient from "./admin-client";

export const metadata = {
  title: "Panel · Sultan Oud Elixir",
  robots: { index: false, follow: false },
};

/**
 * Página del panel de administración — Server Component.
 * 1. Verifica sesión (cookie firmada). Si no hay → muestra login.
 * 2. Si hay sesión → carga perfumes + cupones desde Supabase (service role)
 *    y se los pasa al cliente.
 * La contraseña y el cliente de Supabase viven solo en el servidor.
 */
export default async function AdminPage() {
  const autenticado = await sesionValida();

  if (!autenticado) {
    return (
      <AdminClient
        autenticado={false}
        datos={{ perfumes: [], cupones: [], configurado: false }}
      />
    );
  }

  const datos = await cargarDatosAdmin();
  return <AdminClient autenticado={true} datos={datos} />;
}
