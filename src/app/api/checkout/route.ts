import { NextResponse } from "next/server";

import { WHATSAPP_NUMBER } from "@/data/site-config";
import { buildWhatsAppCheckoutUrl } from "@/lib/format";
import { buscarCuponVigente, consumirCupon } from "@/lib/cupones-server";
import { leerJsonLimitado, validarPostMismoOrigen } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface EntradaItem {
  id?: unknown;
  cantidad?: unknown;
}

const textoCorto = (valor: unknown, maximo: number) =>
  String(valor ?? "").trim().slice(0, maximo);

export async function POST(request: Request) {
  try {
    const errorSolicitud = validarPostMismoOrigen(request);
    if (errorSolicitud) {
      return NextResponse.json({ ok: false, mensaje: errorSolicitud }, { status: 403 });
    }
    const lectura = await leerJsonLimitado<{
      items?: EntradaItem[];
      codigoCupon?: unknown;
      totalEsperado?: unknown;
      delivery?: Record<string, unknown>;
    }>(request, 20_000);
    if (!lectura.ok) {
      return NextResponse.json({ ok: false, mensaje: lectura.mensaje }, { status: lectura.status });
    }
    const body = lectura.valor;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, mensaje: "El pedido no es válido." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return NextResponse.json({ ok: false, mensaje: "El carrito no es válido." }, { status: 400 });
    }

    const cantidades = new Map<string, number>();
    for (const item of body.items) {
      const id = String(item?.id ?? "").trim();
      const cantidad = Number(item?.cantidad);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
        return NextResponse.json({ ok: false, mensaje: "El carrito contiene un producto inválido." }, { status: 400 });
      }
      cantidades.set(id, (cantidades.get(id) ?? 0) + cantidad);
      if ((cantidades.get(id) ?? 0) > 99) {
        return NextResponse.json({ ok: false, mensaje: "La cantidad solicitada no es válida." }, { status: 400 });
      }
    }

    const supabase = supabaseAdmin();
    const ids = [...cantidades.keys()];
    const { data, error } = await supabase
      .from("perfumes")
      .select("id,nombre,marca,sku,volumen_ml,precio_regular,precio_descuento,en_oferta,stock_disponible,activo")
      .in("id", ids);
    if (error) throw new Error(`No se pudo verificar el inventario: ${error.message}`);
    if (!data || data.length !== ids.length) {
      return NextResponse.json(
        { ok: false, mensaje: "Uno de los productos ya no está disponible. Actualizá el carrito." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const porId = new Map(data.map((fila) => [String(fila.id), fila]));
    const lineas = ids.map((id) => {
      const fila = porId.get(id)!;
      const cantidad = cantidades.get(id)!;
      const precioRegular = Number(fila.precio_regular);
      const precioDescuento = fila.precio_descuento == null
        ? null
        : Number(fila.precio_descuento);
      const precio = fila.en_oferta && precioDescuento != null
        ? precioDescuento
        : precioRegular;
      if (
        fila.activo !== true ||
        !Number.isSafeInteger(Number(fila.stock_disponible)) ||
        Number(fila.stock_disponible) < cantidad ||
        !Number.isSafeInteger(precioRegular) ||
        precioRegular <= 0 ||
        (precioDescuento != null && (!Number.isSafeInteger(precioDescuento) || precioDescuento <= 0)) ||
        !Number.isSafeInteger(precio) ||
        precio <= 0
      ) {
        throw new Error(`PRODUCTO_NO_DISPONIBLE:${id}`);
      }
      return {
        cantidad,
        perfume: {
          nombre: String(fila.nombre),
          marca: String(fila.marca),
          sku: fila.sku == null ? null : String(fila.sku),
          volumen_ml: Number(fila.volumen_ml),
          precio_regular: precioRegular,
          precio_descuento: precioDescuento,
          en_oferta: Boolean(fila.en_oferta),
        },
      };
    });

    const subtotal = lineas.reduce((acumulado, linea) => {
      const unitario = linea.perfume.en_oferta && linea.perfume.precio_descuento != null
        ? linea.perfume.precio_descuento
        : linea.perfume.precio_regular;
      const totalLinea = unitario * linea.cantidad;
      const siguiente = acumulado + totalLinea;
      if (!Number.isSafeInteger(totalLinea) || !Number.isSafeInteger(siguiente)) {
        throw new Error("TOTAL_NO_REPRESENTABLE");
      }
      return siguiente;
    }, 0);

    let cupon = null;
    const codigoIngresado = String(body.codigoCupon ?? "").trim();
    if (codigoIngresado) {
      const validacion = await buscarCuponVigente(supabase, codigoIngresado);
      if (!validacion.cupon) {
        return NextResponse.json(
          { ok: false, mensaje: validacion.mensaje },
          { status: validacion.status, headers: { "Cache-Control": "no-store" } }
        );
      }
      cupon = validacion.cupon;
    }

    const descuento = cupon
      ? Math.round((subtotal * cupon.porcentaje_descuento) / 100)
      : 0;
    const total = Math.max(0, subtotal - descuento);
    const totalEsperado = Number(body.totalEsperado);
    if (!Number.isFinite(totalEsperado) || Math.round(totalEsperado) !== Math.round(total)) {
      return NextResponse.json(
        {
          ok: false,
          precioCambio: true,
          subtotal,
          descuento,
          total,
          mensaje: "El precio, el stock o el cupón cambió. Actualizamos el carrito para que puedas revisarlo.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (cupon) {
      const consumido = await consumirCupon(supabase, cupon);
      if (!consumido) {
        return NextResponse.json(
          { ok: false, mensaje: "El cupón cambió o agotó sus usos. Volvé a validarlo." },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      cupon = consumido;
    }
    const cuponPublico = cupon
      ? { codigo: cupon.codigo, porcentaje_descuento: cupon.porcentaje_descuento }
      : null;
    const delivery = body.delivery ?? {};
    const url = buildWhatsAppCheckoutUrl(
      lineas,
      WHATSAPP_NUMBER,
      {
        nombre: textoCorto(delivery.nombre, 100),
        ciudad: textoCorto(delivery.ciudad, 100),
        direccion: textoCorto(delivery.direccion, 300),
        whatsapp: textoCorto(delivery.whatsapp, 50),
      },
      {
        subtotal,
        descuento,
        total,
        codigoCupon: cuponPublico?.codigo ?? null,
        porcentajeCupon: cuponPublico?.porcentaje_descuento ?? null,
      }
    );

    return NextResponse.json(
      { ok: true, url, subtotal, descuento, total, cupon: cuponPublico },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PRODUCTO_NO_DISPONIBLE:")) {
      return NextResponse.json(
        { ok: false, mensaje: "Un producto cambió de precio o stock. Actualizá el carrito antes de continuar." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("[api/checkout]", error);
    return NextResponse.json(
      { ok: false, mensaje: "No pudimos verificar el pedido ahora. Intentá de nuevo." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
