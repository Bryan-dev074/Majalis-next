import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Cupon } from "@/types/database";

const CAMPOS_CUPON =
  "id,codigo,porcentaje_descuento,activo,limite_usos,usos_actuales,fecha_expiracion,created_at";

export interface ResultadoCupon {
  cupon: Cupon | null;
  mensaje: string;
  status: number;
}

export function normalizarCodigoCupon(valor: unknown): string {
  const codigo = String(valor ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{1,32}$/.test(codigo) ? codigo : "";
}

function evaluarCupon(cupon: Cupon | null, codigo: string): ResultadoCupon {
  if (!codigo) return { cupon: null, mensaje: "Ingresá un código válido.", status: 400 };
  if (!cupon) return { cupon: null, mensaje: "Este código no existe.", status: 404 };
  if (!cupon.activo) return { cupon: null, mensaje: "Este código está inactivo.", status: 409 };
  const porcentaje = Number(cupon.porcentaje_descuento);
  const limite = Number(cupon.limite_usos);
  const usos = Number(cupon.usos_actuales);
  if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
    return { cupon: null, mensaje: "Este código tiene una configuración inválida.", status: 409 };
  }
  if (!Number.isInteger(limite) || !Number.isInteger(usos) || usos < 0) {
    return { cupon: null, mensaje: "Este código tiene una configuración inválida.", status: 409 };
  }
  const expira = cupon.fecha_expiracion ? new Date(cupon.fecha_expiracion).getTime() : null;
  if (expira != null && (!Number.isFinite(expira) || expira <= Date.now())) {
    return { cupon: null, mensaje: "Este código ha expirado.", status: 409 };
  }
  if (limite <= 0 || usos >= limite) {
    return { cupon: null, mensaje: "Este código agotó sus usos.", status: 409 };
  }
  return {
    cupon,
    mensaje: `Código aplicado: ${cupon.porcentaje_descuento}% de descuento.`,
    status: 200,
  };
}

export async function buscarCuponVigente(
  supabase: SupabaseClient,
  valor: unknown
): Promise<ResultadoCupon> {
  const codigo = normalizarCodigoCupon(valor);
  if (!codigo) return evaluarCupon(null, codigo);
  const { data, error } = await supabase
    .from("cupones")
    .select(CAMPOS_CUPON)
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(`No se pudo validar el cupón: ${error.message}`);
  return evaluarCupon((data as Cupon | null) ?? null, codigo);
}

/**
 * Reserva un uso con compare-and-swap. Dos checkouts simultáneos no pueden
 * consumir el mismo último uso: solo actualiza si la fila sigue exactamente en
 * el estado que acabamos de validar.
 */
export async function consumirCupon(
  supabase: SupabaseClient,
  cupon: Cupon
): Promise<Cupon | null> {
  let query = supabase
    .from("cupones")
    .update({ usos_actuales: cupon.usos_actuales + 1 })
    .eq("id", cupon.id)
    .eq("codigo", cupon.codigo)
    .eq("activo", true)
    .eq("porcentaje_descuento", cupon.porcentaje_descuento)
    .eq("limite_usos", cupon.limite_usos)
    .eq("usos_actuales", cupon.usos_actuales);
  if (cupon.fecha_expiracion) {
    query = query
      .eq("fecha_expiracion", cupon.fecha_expiracion)
      .gt("fecha_expiracion", new Date().toISOString());
  } else {
    query = query.is("fecha_expiracion", null);
  }
  const { data, error } = await query.select(CAMPOS_CUPON).maybeSingle();
  if (error) throw new Error(`No se pudo reservar el uso del cupón: ${error.message}`);
  return (data as Cupon | null) ?? null;
}
