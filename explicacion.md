# Sultan Oud Elixir — Guía de puesta en marcha

Esta guía describe los pasos que **vos tenés que hacer** para que todo el
sistema funcione correctamente. Está ordenada por prioridad.

---

## 1. Variables de entorno (Vercel)

Entrá a Vercel → tu proyecto → **Settings → Environment Variables** y
asegurate de tener **todas** estas variables (las secretas sin
`NEXT_PUBLIC_`):

| Variable | Pública / Secreta | Para qué sirve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Que la tienda lea los perfumes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Que la tienda lea los perfumes |
| `SUPABASE_URL` | **Secreta** | Que el panel `/admin` escriba en la base |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreta** | Que el panel `/admin` escriba en la base |
| `ADMIN_PASSWORD` | **Secreta** | Tu contraseña para entrar a `/admin` |
| `ADMIN_SESSION_SECRET` | **Secreta** (opcional, recomendada) | Firma la cookie de sesión del panel |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Pública | Tu WhatsApp para pedidos y asistencia |

> ⚠️ Las variables **secretas** solo funcionan en el servidor. Por eso el
> panel las lee desde Server Actions (no desde el navegador). Si falta
> alguna de las dos `SUPABASE_*` secretas, el panel se queda en
> "Modo local" (dorado). Con ambas puestas, pasa a verde
> "Base de datos conectada".

**`ADMIN_SESSION_SECRET`**: poné una cadena larga y aleatoria (ej:
`sultan-x9k2m7p4q8...`). Si no la ponés, deriva de la contraseña y anda
igual, pero es menos seguro.

Después de agregar variables, hacé **Redeploy** en Vercel.

---

## 2. Crear / actualizar las tablas en Supabase

Entrá a Supabase → tu proyecto → **SQL Editor → New query**.

Copiá **todo** el contenido de `schema.sql` (en la raíz del proyecto) y
pegalo en el editor. Hacé clic en **RUN**.

Este script:
- Crea las tablas `perfumes`, `cupones`, `config_proveedores`, etc.
- Carga los perfumes de prueba (marcados como `es_demo = true`).
- **Es idempotente**: podés correrlo varias veces sin romper nada.
- Incluye las migraciones más recientes (`es_dropi`, `es_demo`,
  `clicks_mensuales`, tabla `config_proveedores`).

> Si ya habías corrido una versión vieja, **corrélo de nuevo** sin miedo:
  las líneas `add column if not exists` / `create table if not exists`
  hacen que sea seguro.

---

## 3. Entrar al panel `/admin`

1. Andá a `https://sultan-oud-next.vercel.app/admin` (o tu dominio).
2. Poné tu contraseña (`ADMIN_PASSWORD`).
3. Si ves el banner **verde** "Base de datos conectada" → todo OK. ✅
4. Si ves **rojo** "Sin conexión" → te faltan las variables secretas
   (paso 1) o no corriste el `schema.sql` (paso 2).

---

## 4. Cargar tus productos reales

Desde el panel `/admin`:

1. Pestaña **"Mi Stock Local"** → botón **"Nuevo producto"**.
2. Completá el formulario (cada campo tiene su texto explicativo gris).
3. **SKU**: dejalo vacío → el sistema lo genera solo como
   `MARCA-NOMBRE-ML` (ej: `LTTF-OUDMOOD-100`).
4. Esto permite tener el mismo perfume en distintos tamaños (50ml y
   100ml) como productos independientes.
5. Si el perfume viene de depósito externo (Pago Contra Entrega), marcá
   **"Origen Externo"**. Se va a listar en la pestaña "Origen Externo"
   y el cliente lo verá con la modalidad de contra entrega.

> Los productos de Stock Local llevan automáticamente el badge
> **⚡ Envío Inmediato** en la tienda.

---

## 5. Ocultar los perfumes de prueba

Los perfumes de prueba están en la pestaña **"Pruebas del Sistema"**.
Desde ahí podés:

- **Editar** cualquiera (cambiar precio, stock, imagen).
- **Eliminar** (botón rojo) — lo borra definitivo.
- **Ocultar/Mostrar** individualmente con el switch de cada fila.
- **Interruptor maestro**: oculta todos los demos de un solo clic.
- Hay un buscador para encontrarlos rápido por nombre o SKU.

---

## 6. Configurar el proveedor externo (Dropi)

En la pestaña **"Origen Externo"** hay arriba una tarjeta dorada
**"🔑 Configuración de APIs y Proveedores"**:

1. **Proveedor**: "Dropi Paraguay" (o el que uses).
2. **URL Base de la API**: `https://api.dropi.co` (cuando te lo pasen).
3. **API Key / Token**: pegá el token que te dé el proveedor.
4. **Automatizar sincronización diaria**: activá si querés que el stock
   se actualice solo cada día.
5. **Guardar Configuración**.
6. **Sincronizar Stock Ahora**: fuerza una lectura manual.

> La sincronización real (leer productos de Dropi y traerlos a tu tienda)
> se activa cuando el proveedor confirme los endpoints exactos. La
> infraestructura ya está lista.

---

## 7. Analítica (Top 5 del mes)

La pestaña **"Analítica"** muestra los 5 perfumes más vistos del mes.
Cada vez que un cliente abre el detalle de un perfume, suma +1 en
`clicks_mensuales`. Botón **"Resetear contadores"** → hacerlo al inicio
de cada mes.

---

## 8. Cambiar redes sociales y WhatsApp

**Todo en un solo archivo**: `src/data/site-config.ts`

```ts
export const WHATSAPP_NUMBER = "595982064334";          // tu número
export const WHATSAPP_MENSAJE_FLOTANTE = "Hola, busco asistencia personalizada";

export const REDES_SOCIALES = [
  { tipo: "instagram", url: "https://instagram.com/sultan.oud.elixir", ... },
  { tipo: "facebook",  url: "https://facebook.com/sultan.oud.elixir",  ... },
  { tipo: "tiktok",    url: "https://tiktok.com/@sultan.oud.elixir",   ... },
];

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "sultan-admin-2026";
```

Cambiá los `url` por los tuyos y listo.

---

## 9. Cambiar la contraseña del panel

- **Recomendado**: ponela en Vercel como `ADMIN_PASSWORD` (no queda en
  el código que es público en GitHub).
- **Rápido**: editá el valor por defecto en `src/data/site-config.ts`.

---

## 10. Cambiar el logo / favicon

- El favicon actual está en `src/app/favicon.ico` (tu archivo `.ico`
  de la carpeta `logoud/`).
- Para cambiarlo: reemplazá ese archivo por el nuevo `.ico` con el mismo
  nombre. Next.js lo sirve automáticamente.

---

## Checklist final

- [ ] Variables de entorno en Vercel (las 5 obligatorias + 1 opcional)
- [ ] `schema.sql` corrido en Supabase
- [ ] Panel `/admin` muestra banner **verde**
- [ ] Productos reales cargados en "Mi Stock Local"
- [ ] Perfumes de prueba ocultados o eliminados
- [ ] Redes sociales y WhatsApp configurados en `site-config.ts`
- [ ] Contraseña cambiada de la default

¿Dudas? Todo el código está comentado en español.
