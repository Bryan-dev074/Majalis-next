import { Cupon } from "@/types/database";

/** Cupones de respaldo — reflejan el seed de schema.sql. */
export const FALLBACK_CUPONES: Cupon[] = [
  {
    id: "fc-1",
    codigo: "MAJALIS10",
    porcentaje_descuento: 10,
    activo: true,
    limite_usos: 100,
    usos_actuales: 0,
    fecha_expiracion: "2026-12-31T23:59:59-03:00",
    created_at: new Date().toISOString(),
  },
  {
    id: "fc-2",
    codigo: "MAJALIS15",
    porcentaje_descuento: 15,
    activo: true,
    limite_usos: 50,
    usos_actuales: 0,
    fecha_expiracion: "2026-12-31T23:59:59-03:00",
    created_at: new Date().toISOString(),
  },
  {
    id: "fc-3",
    codigo: "DUBAI20",
    porcentaje_descuento: 20,
    activo: true,
    limite_usos: 20,
    usos_actuales: 0,
    fecha_expiracion: "2026-12-31T23:59:59-03:00",
    created_at: new Date().toISOString(),
  },
];
