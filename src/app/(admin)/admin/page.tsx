import { cargarDatosAdmin } from "./actions";
import { sesionValida } from "@/lib/supabase-admin";
import AdminClient from "./admin-client";

export const metadata = {
  title: "Panel · Majalis",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const autenticado = await sesionValida();

  if (!autenticado) {
    return (
      <AdminClient
        autenticado={false}
        datos={{ perfumes: [], cupones: [], configurado: false, top5: [], erroresCarga: [] }}
      />
    );
  }

  const datos = await cargarDatosAdmin();
  return <AdminClient autenticado={true} datos={datos} />;
}
