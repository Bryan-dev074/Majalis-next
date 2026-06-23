# Sultan Oud Elixir — Guía de puesta en marcha

Este documento explica, paso a paso, cómo:

1. [Conectar la base de datos de Supabase](#1-conectar-supabase) (si todavía no la tenés conectada)
2. [Cargar productos en la tienda](#2-cargar-productos-para-vender)
3. [Ocultar los perfumes de prueba](#3-ocultar-los-perfumes-de-prueba)
4. [Usar el panel de administración](#4-panel-de-administraci%C3%B3n-admin)
5. [Cambiar los links de tus redes sociales y WhatsApp](#5-redes-sociales-y-whatsapp)
6. [Conectar una API de Dropi (proveedor) en el futuro](#6-integraci%C3%B3n-con-api-de-dropi-futuro)
7. [Modificar la contraseña del panel](#7-cambiar-la-contrase%C3%B1a-del-panel)

---

## 1. Conectar Supabase

Tu proyecto ya tiene un proyecto Supabase creado:
`https://fpzmdezcmbyplbdngcke.supabase.co`

### Paso 1.1 — Crear las tablas

1. Entrá a tu proyecto: <https://supabase.com/dashboard> → abrí el proyecto **Sultan Oud Elixir**.
2. En el menú izquierdo, andá a **SQL Editor** → **New query**.
3. Abrí el archivo `schema.sql` de este repositorio (en la raíz del proyecto), copiá **todo** su contenido y pegalo en el editor.
4. Hacé clic en **RUN**. Esto crea las tablas `perfumes`, `cupones`, `perfiles_usuario`, `pedidos` y carga los 11 perfumes de prueba + los cupones.

> Si ya lo habías corrido antes, volver a ejecutarlo no rompe nada (usa `on conflict do update`).

### Paso 1.2 — Variables de entorno (ya configuradas)

Tu `.env.local` ya tiene las variables **públicas** (anon):

```env
NEXT_PUBLIC_SUPABASE_URL=https://fpzmdezcmbyplbdngcke.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_bHgBBQYPKg3QgHkL5H24MQ_yjB0pQw4
NEXT_PUBLIC_WHATSAPP_NUMBER=595982064334
```

Estas alcanzan para que **la tienda lea** los perfumes. ✅

### Paso 1.3 — Variables para el panel `/admin` (RECOMENDADO)

Para que el panel pueda **modificar** perfumes (ocultar, destacar) y que esos cambios se vean en **todos** los dispositivos, necesitás la **service role key** (clave secreta de servidor):

1. Supabase Dashboard → **Project Settings** (ícono de engranaje abajo a la izquierda) → **API**.
2. En **Project URL** copiá la URL. En **Project API keys** copiá la **`service_role`** (la secreta, NO la `anon`).
3. Agregá estas dos variables a `.env.local`:

```env
SUPABASE_URL=https://fpzmdezcmbyplbdngcke.supabase.co
SUPABASE_SERVICE_ROLE_KEY=pegar_aqui_la_service_role_key_secreta
```

4. En **Vercel** (donde está desplegado tu sitio): entrá a tu proyecto → **Settings** → **Environment Variables** → agregá las mismas dos variables (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`). Después hacé **Redeploy**.

> ⚠️ **NUNCA** subas la `service_role` al repositorio público. `.env.local` está en `.gitignore` y no se sube. En Vercel es segura porque vive en sus servidores.

**¿Qué pasa si no configurás la service role?** El panel `/admin` funciona igual, pero los cambios se aplican **solo en tu navegador** (modo local). Para que sean globales, seguí los pasos de arriba.

### Paso 1.4 — Verificar que todo anda

1. Reiniciá el servidor: `npm run dev`.
2. Abrí <http://localhost:3000>. Deberías ver los 11 perfumes cargados desde Supabase.
3. Si los ves, ¡ya está conectado! 🎉

---

## 2. Cargar productos para vender

Tenés **dos formas** de agregar perfumes. En ambos casos, cuando agregás un perfume con una **marca nueva**, esa marca aparece **automáticamente** como filtro en la "Cámara olfativa" (no tenés que tocar nada).

### Opción A — Desde el panel de Supabase (más visual)

1. Supabase Dashboard → **Table Editor** → tabla **`perfumes`**.
2. Hacé clic en **Insert row**.
3. Completá los campos:

| Campo | Qué poner | Ejemplo |
|---|---|---|
| `nombre` | Nombre del perfume | `Oud for Glory` |
| `marca` | La marca | `Lattafa` o una nueva: `Layali` |
| `precio_regular` | Precio en Guaraníes (sin puntos) | `350000` |
| `precio_descuento` | Precio de oferta o dejá vacío | `279000` |
| `en_oferta` | `true` si tiene descuento | `true` |
| `stock_disponible` | Unidades | `10` |
| `volumen_ml` | Tamaño | `100` |
| `activo` | `true` para que se vea en la tienda | `true` |
| `url_imagen` | Link de la foto del frasco | `https://...` |
| `descripcion` | Texto que verá el cliente | `Un oud amaderado…` |
| `notas_olfativas` | Estructura JSON (ver abajo) | `{...}` |
| `categoria` | Array de etiquetas (marca + familias) | `{Lattafa, Oud}` |
| `sku` | Código único (opcional) | `LTTF-OUD-GLORY` |
| `destacado` | `true` para que aparezca en "Favoritos" | `true` |

4. **`notas_olfativas`** tiene este formato exacto (clic derecho en la celda → **Enter to edit**):

```json
{
  "salida": ["Azafrán", "Rosa"],
  "corazon": ["Oud", "Pachulí"],
  "fondo": ["Ámbar", "Almizcle"]
}
```

5. Hacé clic en **Save**. Aparece de inmediato en la tienda (refrescá la página).

### Opción B — Por SQL (para cargar varios a la vez)

En **SQL Editor**, ejecutá algo así (ejemplo con un perfume nuevo):

```sql
insert into public.perfumes
  (nombre, marca, precio_regular, precio_descuento, en_oferta,
   stock_disponible, volumen_ml, activo, url_imagen, descripcion,
   notas_olfativas, categoria, sku, destacado)
values
  ('Oud for Glory', 'Lattafa', 350000, 279000, true,
   10, 100, true,
   'https://fimgs.net/mdimg/perfume-thumbs/375x500.12345.jpg',
   'Un oud amaderado y real.',
   '{"salida":["Azafrán","Rosa"],"corazon":["Oud","Pachulí"],"fondo":["Ámbar","Almizcle"]}'::jsonb,
   array['Lattafa','Oud'], 'LTTF-OUD-GLORY', true);
```

### Sobre la marca nueva y los filtros

- El sistema lee las **marcas y familias olfativas directamente de los perfumes cargados**.
- Si cargás un perfume de la marca `Layali` (que no existía), `Layali` aparece **solo** como pestaña nueva en la Cámara olfativa. No tenés que tocar código.
- Lo mismo con las familias: si ponés `Cítrico` en `categoria` y no existía, se agrega como chip.

### Sobre las imágenes

La URL de la imagen tiene que ser **pública y HTTPS**. Opciones:

- **Fragrantica** (fotos reales de frascos): `https://fimgs.net/mdimg/perfume-thumbs/375x500.XXXXX.jpg`
- **Tu propio hosting** (lo más recomendado a largo plazo).
- Si querés usar un dominio nuevo, avisame: hay que agregarlo en `next.config.mjs` → `images.remotePatterns`.

---

## 3. Ocultar los perfumes de prueba

Tu tienda arranca con 11 perfumes de prueba. Para empezar a vender los tuyos y **ocultar** esos:

1. Entrá a **`/admin`** (ej: `https://sultan-oud-next.vercel.app/admin` o `http://localhost:3000/admin`).
2. Poné tu contraseña (ver [sección 7](#7-cambiar-la-contrase%C3%B1a-del-panel)).
3. Hay un botón grande **"Ocultar todos los de prueba"** → lo clickeás y los 11 quedan ocultos de la tienda.
4. También podés ocultar/mostrar perfume por perfume con el botón **Visible / Oculto** de cada uno.
5. Y marcar/desmarcar **destacados** con la estrella.

> Si tenés Supabase service role configurado (sección 1.3), el cambio es **global** (todos los clientes). Si no, solo afecta **tu navegador**.

---

## 4. Panel de administración `/admin`

Es privado: solo vos tenés la contraseña. Desde ahí podés:

- **Ver** todos los perfumes (activos e inactivos).
- **Mostrar / Ocultar** cualquier perfume de la tienda.
- **Marcar / Desmarcar** como destacado (aparece en "Favoritos del momento").
- **Ocultar todos** los de prueba de una sola vez.
- **Actualizar** la lista (botón ↻).

El panel muestra un indicador verde **"Base de datos"** cuando está conectado a Supabase con service role, o dorado **"Modo local"** cuando no.

---

## 5. Redes sociales y WhatsApp

**TODO se configura en un solo archivo:**

```
src/data/site-config.ts
```

Abrilo y editá:

```ts
// Tu número de WhatsApp (formato internacional sin + ni espacios)
export const WHATSAPP_NUMBER = "595982064334";

// Mensaje del botón flotante
export const WHATSAPP_MENSAJE_FLOTANTE = "Hola, busco asistencia personalizada";

export const REDES_SOCIALES = [
  {
    tipo: "instagram",
    url: "https://instagram.com/sultan.oud.elixir", // 👈 TU INSTAGRAM
    label: "Instagram",
  },
  {
    tipo: "facebook",
    url: "https://facebook.com/sultan.oud.elixir", // 👈 TU FACEBOOK
    label: "Facebook",
  },
  {
    tipo: "whatsapp",
    url: buildWaLink(WHATSAPP_MENSAJE_FLOTANTE),
    label: "WhatsApp",
  },
];
```

- Reemplazá las `url` por las de tus cuentas reales.
- Los cambios aparecen en el **footer** y en el **botón flotante** de WhatsApp.
- Para el WhatsApp, poné tu número en `WHATSAPP_NUMBER`. El link se genera solo.

> Para el número de WhatsApp de **pedidos** (el que recibe los pedidos del carrito), se usa `WHATSAPP_NUMBER`. Si querés un número distinto para pedidos vs. asistencia, avisame y te lo separo.

---

## 6. Integración con API de Dropi (futuro)

Tu idea es conectar **Dropi** (o un proveedor similar) para:

- Importar perfumes automáticamente desde el catálogo del proveedor.
- Sincronizar el **stock** en tiempo real.
- Automatizar la carga de productos.

Acá tenés el diseño completo para cuando consigas el acceso a la API. Lo dejo documentado para que sea straightforward.

### Paso 6.1 — Conseguir credenciales

1. Entrá a Dropi / tu proveedor y buscá la sección de **API** o **Integraciones**.
2. Necesitás: **API URL base** (ej: `https://api.dropi.co/api/v1`) y un **token / API key**.
3. Anotalos. Algunos proveedores piden usuario+contraseña en vez de token.

### Paso 6.2 — Agregar variables de entorno

En `.env.local` **y** en Vercel (estas NO llevan `NEXT_PUBLIC_` porque son secretas del servidor):

```env
DROPI_API_URL=https://api.dropi.co/api/v1
DROPI_API_KEY=tu_token_secreto_aqui
# Mapeo: proveedor → marca interna (opcional)
DROPI_MARCA_DEFAULT=Importado
```

### Paso 6.3 — Crear el conector con la API del proveedor

Crear el archivo `src/lib/dropi.ts` (este es el molde — cuando tengas la doc real de Dropi, ajustás los nombres de campos):

```ts
// src/lib/dropi.ts
import { Perfume } from "@/types/database";

interface DropiProducto {
  id: string;
  nombre: string;
  marca: string;
  precio: number;          // precio del proveedor
  stock: number;
  imagen: string;
  descripcion: string;
  volumen_ml: number;
  sku?: string;
  // ... los campos que Dropi realmente devuelva
}

/** Llama al endpoint de productos del proveedor. */
async function fetchDropiProductos(): Promise<DropiProducto[]> {
  const url = process.env.DROPI_API_URL;
  const key = process.env.DROPI_API_KEY;
  if (!url || !key) throw new Error("Falta configuración de Dropi");

  const res = await fetch(`${url}/productos`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Dropi respondió ${res.status}`);
  return (await res.json()) as DropiProducto[];
}

/** Margen de ganancia sobre el precio del proveedor (ej: 1.6 = 60% markup). */
const MARGEN = 1.6;

/** Convierte un producto del proveedor al formato interno Perfume. */
function mapear(p: DropiProducto): Omit<Perfume, "id" | "created_at" | "updated_at"> {
  const precio_regular = Math.round((p.precio * MARGEN) / 1000) * 1000; // redondea a millares
  return {
    nombre: p.nombre,
    marca: p.marca || process.env.DROPI_MARCA_DEFAULT || "Importado",
    precio_regular,
    precio_descuento: null,
    en_oferta: false,
    porcentaje_descuento: 0,
    stock_disponible: p.stock,
    volumen_ml: p.volumen_ml || 100,
    activo: p.stock > 0,
    url_imagen: p.imagen,
    descripcion: p.descripcion || p.nombre,
    notas_olfativas: { salida: [], corazon: [], fondo: [] }, // Dropi no suele darlas
    categoria: [p.marca || "Importado"],
    sku: p.sku ?? `DROPI-${p.id}`,
    destacado: false,
  };
}

/**
 * Sincroniza el catálogo: inserta/actualiza productos de Dropi en Supabase.
 * - Usa el SKU para no duplicar.
 * - Actualiza stock y precio.
 * - No borra perfumes manuales (solo los que vienen de Dropi).
 */
export async function sincronizarDropi(): Promise<{ actualizados: number }> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const productos = await fetchDropiProductos();
  let actualizados = 0;

  for (const p of productos) {
    const perfume = mapear(p);
    const { error } = await supabase.from("perfumes").upsert(
      {
        nombre: perfume.nombre,
        marca: perfume.marca,
        precio_regular: perfume.precio_regular,
        stock_disponible: perfume.stock_disponible,
        volumen_ml: perfume.volumen_ml,
        url_imagen: perfume.url_imagen,
        descripcion: perfume.descripcion,
        sku: perfume.sku,
        activo: perfume.activo,
      },
      { onConflict: "sku" }
    );
    if (!error) actualizados++;
  }

  return { actualizados };
}
```

> ⚠️ Los nombres de campos (`nombre`, `precio`, `stock`, `imagen`…) son un **ejemplo**. Cuando abras la documentación de la API de Dropi, reemplazá por los nombres reales que devuelvan.

### Paso 6.4 — Crear el endpoint de sincronización

Crear `src/app/api/sincronizar-dropi/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { sincronizarDropi } from "@/lib/dropi";
import { ADMIN_PASSWORD } from "@/data/site-config";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await sincronizarDropi();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
```

### Paso 6.5 — Botón en el panel `/admin`

Cuando la integración esté lista, se le puede agregar un botón **"Sincronizar con Dropi"** al panel que llame a ese endpoint. Avisame cuando tengas las credenciales y lo conectamos.

### Paso 6.6 — Sincronización automática (opcional)

Para que el stock se actualice solo cada X horas, en **Vercel** podés usar **Vercel Cron**:

1. Crear `vercel.json` en la raíz:

```json
{
  "crons": [{ "path": "/api/sincronizar-dropi?cron=1", "schedule": "0 */6 * * *" }]
}
```

2. El endpoint `/api/sincronizar-dropi` tendría que aceptar también GET con un header de verificación de Vercel (`CRON_SECRET`) para que solo Vercel pueda dispararlo.

Esto corre cada 6 horas y mantiene el stock al día automáticamente.

### Consideraciones importantes para Dropi

- **Stock = 0**: si un proveedor marca stock 0, el perfume se sigue mostrando pero como **"Agotado"** (la UI ya lo maneja). Podés decidir si preferís ocultarlo (`activo = false`).
- **Precios**: el `MARGEN` (markup) se ajusta en `src/lib/dropi.ts`. Cambialo según tu estrategia.
- **Marcas nuevas**: aparecen solas como filtro, como ya vimos.
- **No duplicar**: el campo `sku` es `unique` en la base. `upsert` con `onConflict: "sku"` evita duplicados.
- **No sobrescribir tus ediciones**: si vos marcás un perfume como `destacado` o le ponés `precio_descuento`, la sincronización tendría que respetar esos campos. En el ejemplo de arriba solo actualizo stock/precio/imagen. Ajustalo según tu criterio.

---

## 7. Cambiar la contraseña del panel

La contraseña está en `src/data/site-config.ts`:

```ts
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "sultan-admin-2026";
```

**Dos opciones:**

1. **Rápida**: cambiá el valor por defecto (`"sultan-admin-2026"`) por el que quieras.
2. **Recomendada** (más seguro): dejá el código como está y agregá en `.env.local` y en Vercel:

```env
ADMIN_PASSWORD=tu_nueva_contraseña_secreta
```

Así la contraseña no queda en el código (que es público en GitHub).

---

## Resumen rápido

| Quiero… | Voy a… |
|---|---|
| Conectar la base | Ejecutar `schema.sql` en Supabase SQL Editor |
| Cargar un perfume | Table Editor → `perfumes` → Insert row |
| Ocultar los de prueba | Entrar a `/admin` → "Ocultar todos" |
| Cambiar redes/WhatsApp | Editar `src/data/site-config.ts` |
| Cambiar la contraseña | Editar `src/data/site-config.ts` o `ADMIN_PASSWORD` en env |
| Conectar Dropi | Seguir la sección 6 cuando tengas las credenciales |

¿Dudas? Revisá este archivo o el código — todo está comentado en español.

---

# ACTUALIZACIÓN v2 — Panel profesional + Stock Local vs Dropi

> Esta versión refactoriza el panel `/admin` por completo. Si ya tenías la
> v1 funcionando, solo necesitás **volver a ejecutar `schema.sql`** en
> Supabase (es idempotente) para agregar la columna `es_dropi`.

## Novedades

### 🔐 Autenticación en servidor (corrección crítica)
Antes la contraseña y la conexión a Supabase se validaban en el navegador,
que no puede ver variables sin el prefijo `NEXT_PUBLIC_`. Ahora **todo vive
en el servidor** (Server Actions + cookie firmada con HMAC-SHA256).

- Entrás a `/admin`, escribís la contraseña → se valida en el server y se
  setea una cookie `httpOnly` de 7 días.
- En cada recarga, el Server Component verifica la cookie y carga los datos
  con la `SERVICE_ROLE_KEY` (que NUNCA llega al navegador).
- El indicador pasa a **verde "Base de datos conectada"** de forma global.

### 🎨 Panel claro, legible y cómodo
- Tema claro propio (`src/styles/admin.css`), alto contraste, diseñado para
  trabajar horas sin fatiga visual.
- Badges de colores vivos: 🟢 Visible · ⚫ Oculto · 🔴 Agotado · 🟡 Dropi.
- Tabla con buscador interno y filtro por marca.

### 📦 Stock Local vs Catálogo Dropi
Cada perfume tiene un origen claro:

| Origen | ¿Qué es? | ¿Cómo se marca? |
|---|---|---|
| **Mi Stock Local** | Perfumes tuyos, control total, envío inmediato, precios más bajos | `es_dropi = false` (default) |
| **Catálogo Dropi** | Importados vía API futura, envío más largo | `es_dropi = true` o SKU con prefijo `DROPI-` |

El panel tiene **pestañas separadas** para cada uno, así no se mezclan.

### ⚡ Control de stock express
En "Mi Stock Local", al lado del stock de cada perfume hay botones **`−`**
y **`+`**. Un clic = restar o sumar una unidad. Ideal para vender en el
local sin abrir el formulario.

### 📊 KPIs y gestión de cupones
- Tarjetas de métricas: Stock Local, Catálogo Dropi, Bajo stock (<3),
  Cupones activos.
- Pestaña **Cupones** para activar, desactivar, editar `%` o crear nuevos.

### 🔥 Ofertas de Envío Inmediato (tienda)
En la home, arriba del catálogo, hay un botón **muy llamativo** dorado/verde.
Al clickearlo, la tienda filtra y muestra **solo** los perfumes de tu stock
local que tengan `en_oferta = true`. Son los más baratos y de entrega
inmediata → los empujás visualmente para vender más rápido.

Para que un perfume aparezca ahí:
1. Cargalo desde `/admin` → Mi Stock Local → Nuevo.
2. Marcá **"En oferta"** y ponele un `precio_descuento`.
3. Asegurate de que **NO** esté marcado como Dropi.

## Variables de entorno (Vercel) — checklist v2

```
NEXT_PUBLIC_SUPABASE_URL        ← pública (lectura de la tienda)
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← pública (lectura de la tienda)
SUPABASE_URL                    ← secreta (server: admin)
SUPABASE_SERVICE_ROLE_KEY       ← secreta (server: admin)
ADMIN_PASSWORD                  ← secreta (tu contraseña del panel)
ADMIN_SESSION_SECRET            ← opcional, recomendada (firma la cookie)
NEXT_PUBLIC_WHATSAPP_NUMBER     ← pública (tu WhatsApp)
```

> `ADMIN_SESSION_SECRET` es opcional: si no la ponés, deriva de la
> contraseña. Pero para producción conviene una cadena larga y aleatoria.

## Migración (si ya tenías la v1)

En **Supabase → SQL Editor**, ejecutá de nuevo `schema.sql` entero. Las
líneas nuevas que importan:

```sql
alter table public.perfumes
    add column if not exists es_dropi boolean not null default false;

update public.perfumes
   set es_dropi = true
 where sku is not null and sku like 'DROPI-%';
```

No se pierde ningún dato. Los 11 perfumes de prueba quedan como
`es_dropi = false` (stock local) → podés ocultarlos o editarlos.

