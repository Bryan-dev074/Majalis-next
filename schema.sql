-- ============================================================================
--  SULTAN OUD ELIXIR · Schema de inicialización para Supabase
--  Ejecutar en: Supabase SQL Editor
--  Proyecto: https://fpzmdezcmbyplbdngcke.supabase.co
-- ============================================================================
--  Diseñado a largo plazo: RLS listo para activarse, claves foráneas íntegras,
--  índices en columnas de búsqueda y datos seed de los 11 perfumes base.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  Extensión: UUID si no existe (compatibilidad)
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;
-- ----------------------------------------------------------------------------
--  1. TABLA: perfumes
-- ----------------------------------------------------------------------------
create table if not exists public.perfumes (
    id                    uuid primary key default gen_random_uuid(),
    nombre                text        not null,
    marca                 text        not null,
    precio_regular        bigint      not null,           -- en Guaraníes (Gs.)
    precio_descuento      bigint,                         -- en Guaraníes (Gs.); null si no hay descuento
    en_oferta             boolean     not null default false,
    porcentaje_descuento  integer     generated always as (
        case
            when precio_descuento is not null and precio_regular > 0
            then round((1.0 - (precio_descuento::numeric / precio_regular::numeric)) * 100)::integer
            else 0
        end
    ) stored,
    stock_disponible      integer     not null default 0 check (stock_disponible >= 0),
    volumen_ml            integer     not null default 100 check (volumen_ml > 0),
    activo                boolean     not null default true,
    url_imagen            text        not null,
    descripcion           text        not null,
    notas_olfativas       jsonb       not null,
    categoria             text[]      not null default '{}',
    sku                   text        unique,
    destacado             boolean     not null default false,
    es_dropi              boolean     not null default false,  -- true: importado vía Dropi (envío más largo); false: stock local propio
    es_demo               boolean     not null default false,  -- true: perfume de prueba del seed inicial
    clicks_mensuales      integer     not null default 0,      -- vistas del detalle del perfume en el mes
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists idx_perfumes_categoria    on public.perfumes using gin (categoria);
create index if not exists idx_perfumes_marca        on public.perfumes (marca);
create index if not exists idx_perfumes_activo       on public.perfumes (activo);
create index if not exists idx_perfumes_destacado    on public.perfumes (destacado);
create index if not exists idx_perfumes_en_oferta    on public.perfumes (en_oferta);
create index if not exists idx_perfumes_nombre_trgm  on public.perfumes using gin (nombre gin_trgm_ops);
-- (gin_trgm_ops requiere pg_trgm; se ignora el error si no está instalada la extensión)

-- ----------------------------------------------------------------------------
--  2. TABLA: cupones
-- ----------------------------------------------------------------------------
create table if not exists public.cupones (
    id                   uuid primary key default gen_random_uuid(),
    codigo               text        not null unique,
    porcentaje_descuento integer     not null check (porcentaje_descuento between 0 and 100),
    activo               boolean     not null default true,
    limite_usos          integer     not null default 1 check (limite_usos >= 0),
    usos_actuales        integer     not null default 0 check (usos_actuales >= 0),
    fecha_expiracion     timestamptz,
    created_at           timestamptz not null default now()
);

create index if not exists idx_cupones_codigo on public.cupones (codigo);
create index if not exists idx_cupones_activo on public.cupones (activo);

-- ----------------------------------------------------------------------------
--  2b. TABLA: config_proveedores  (credenciales Dropi y similares)
--      Una sola fila activa por proveedor (limit(1) en el admin).
-- ----------------------------------------------------------------------------
create table if not exists public.config_proveedores (
    id                    uuid primary key default gen_random_uuid(),
    proveedor             text        not null default 'Dropi Paraguay',
    api_url               text,                              -- URL base del proveedor
    api_key               text,                              -- token (se enmascara en el cliente)
    sincronizar_diario    boolean     not null default false,
    ultimo_sync           timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  3. TABLA: perfiles_usuario
-- ----------------------------------------------------------------------------
create table if not exists public.perfiles_usuario (
    whatsapp          text primary key,                          -- obligatorio / clave natural
    nombre_completo   text,
    email             text,
    rol               text not null default 'cliente',
    direccion_exacta  text,
    ciudad            text,
    barrio            text,
    indicaciones_delivery text,
    rango_horarios    text,
    created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  4. TABLA: pedidos
-- ----------------------------------------------------------------------------
create table if not exists public.pedidos (
    id                  uuid primary key default gen_random_uuid(),
    perfil_whatsapp     text references public.perfiles_usuario(whatsapp) on delete set null,
    desglose_productos  jsonb   not null,            -- [{ nombre, marca, precio_unit, cantidad }]
    subtotal            bigint  not null,
    descuento_aplicado  bigint  not null default 0,
    total_final         bigint  not null,            -- en Guaraníes (Gs.)
    estado_entrega      text    not null default 'pendiente',
    created_at          timestamptz not null default now()
);

create index if not exists idx_pedidos_perfil    on public.pedidos (perfil_whatsapp);
create index if not exists idx_pedidos_estado    on public.pedidos (estado_entrega);
create index if not exists idx_pedidos_created   on public.pedidos (created_at desc);

-- ----------------------------------------------------------------------------
--  Trigger: mantener updated_at en perfumes
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_perfumes_updated_at on public.perfumes;
create trigger trg_perfumes_updated_at
    before update on public.perfumes
    for each row execute function public.set_updated_at();

-- ============================================================================
--  SEED · 11 perfumes del catálogo original con notas olfativas premium (JSON)
--  Estructura notas_olfativas: { salida: [], corazon: [], fondo: [] }
--  Moneda: Guaraníes paraguayos (Gs.)
-- ============================================================================
--  Política de datos de prueba:
--   · Algunos con descuento (en_oferta = true, precio_descuento definido).
--   · Algunos con stock = 0 para validar el estado "Agotado".
--   · SKU autogenerado por marca + slug.
--   · es_demo = true para todos (así los podés ocultar en bloque desde /admin).
-- ============================================================================

insert into public.perfumes
    (nombre, marca, precio_regular, precio_descuento, en_oferta, stock_disponible, volumen_ml, activo,
     url_imagen, descripcion, notas_olfativas, categoria, sku, destacado, es_demo)
values
-- 1. Oud Mood — Lattafa — EN OFERTA
('Oud Mood', 'Lattafa', 250000, 199000, true, 8, 100, true,
 'https://images.unsplash.com/photo-1594035910387-fea47794261f?q=80&w=900&auto=format&fit=crop',
 'Un bouquet amaderado de oud rosa que evoca los palacios de Arabia. Cálido, especiado y profundamente real.',
 '{
    "salida":   ["Oud rosa","Azafrán","Rosa de Damasco"],
    "corazon":  ["Pachulí","Cuero noble","Especias dulces"],
    "fondo":    ["Ámbar gris","Almizcle blanco","Sándalo Mysore"]
 }'::jsonb,
 array['Lattafa','Oud'], 'LTTF-OUDMOOD', true, true),

-- 2. Bade'e Al Oud (Glory) — Lattafa — precio regular, stock alto
('Bade''e Al Oud (Glory)', 'Lattafa', 350000, null, false, 15, 100, true,
 'https://images.unsplash.com/photo-1585232004423-244e0e6904e3?q=80&w=900&auto=format&fit=crop',
 'Oud para la grandeza. Una declaración de poder olfativo, intenso y luminoso, inspirado en las grandes obras de la perfumería árabe.',
 '{
    "salida":   ["Oud","Azafrán"],
    "corazon":  ["Rosa","Pachulí","Prunela"],
    "fondo":    ["Almizcle","Vainilla","Ámbar"]
 }'::jsonb,
 array['Lattafa','Oud'], 'LTTF-BADGE-GLORY', true, true),

-- 3. Club de Nuit Intense — Armaf — EN OFERTA
('Club de Nuit Intense', 'Armaf', 320000, 279000, true, 6, 105, true,
 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?q=80&w=900&auto=format&fit=crop',
 'El rey de los cítricos ahumados. Fresco en la apertura, seco y magnético en el fondo, con una estela legendaria.',
 '{
    "salida":   ["Limón siciliano","Bergamota","Manzana verde","Menta"],
    "corazon":  ["Birch tar","Rosa","Jazmín","Iso E Super"],
    "fondo":    ["Almizcle","Vainilla","Pachulí","Vetiver"]
 }'::jsonb,
 array['Armaf','Fresco'], 'ARMAF-CLUBNUIT-INT', true, true),

-- 4. Yara Moi — Lattafa — precio regular, stock medio
('Yara Moi', 'Lattafa', 220000, null, false, 5, 90, true,
 'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?q=80&w=900&auto=format&fit=crop',
 'Crema de vainilla y orquídea. Floral, dulce y envolvente, una caricia olfativa de elegancia femenina.',
 '{
    "salida":   ["Mandarina","Heliotropo","Pera"],
    "corazon":  ["Orquídea","Flor de azahar","Jazmín"],
    "fondo":    ["Vainilla de Madagascar","Sándalo","Almizcle"]
 }'::jsonb,
 array['Lattafa','Dulce'], 'LTTF-YARAMOI', false, true),

-- 5. Asad — Lattafa — EN OFERTA
('Asad', 'Lattafa', 280000, 235000, true, 10, 100, true,
 'https://images.unsplash.com/photo-1615162620596-3c32dc4a72d7?q=80&w=900&auto=format&fit=crop',
 'Especiado, picante y masculino. Una lectura moderna de los elixires con cuerpo, cálido en invierno y magnético de noche.',
 '{
    "salida":   ["Pimienta negra","Artemisia","Tabaco dulce"],
    "corazon":  ["Ambar","Lavanda","Manzana seca","Semilla de cilantro"],
    "fondo":    ["Vainilla","Oud","Almizcle","Pachulí"]
 }'::jsonb,
 array['Lattafa','Especiado'], 'LTTF-ASAD', true, true),

-- 6. Khamrah — Lattafa — precio regular, stock agotado (validación UI)
('Khamrah', 'Lattafa', 380000, null, false, 0, 100, true,
 'https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=900&auto=format&fit=crop',
 'Canela, dátiles y praliné. Un gourmand especiado que envuelve como un manto real. La celebración del dulzor oriental.',
 '{
    "salida":   ["Canela de Ceilán","Cítricos","Bergamota"],
    "corazon":  ["Dátiles","Prunela","Loto","Canela dulce"],
    "fondo":    ["Vainilla","Sándalo","Mirra","Almizcle tonka"]
 }'::jsonb,
 array['Lattafa','Dulce'], 'LTTF-KHAMRAH', true, true),

-- 7. Hawas — Rasasi — precio regular, stock medio
('Hawas', 'Rasasi', 450000, null, false, 7, 100, true,
 'https://images.unsplash.com/photo-1595425281289-99d2a7263652?q=80&w=900&auto=format&fit=crop',
 'Acuático, ciruela y canela. Una bestia de verano: fresco en la apertura, profundo y persistente en el seco.',
 '{
    "salida":   ["Bergamota","Manzana roja","Ciruela","Pera"],
    "corazon":  ["Canela","Cardamomo","Lirio acuático","Pimienta de Jamaica"],
    "fondo":    ["Almizcle","Vetiver","Sándalo","Dracena"]
 }'::jsonb,
 array['Fresco','Rasasi'], 'RSI-HAWAS', true, true),

-- 8. 9pm — Afnan — EN OFERTA
('9pm', 'Afnan', 260000, 219000, true, 9, 100, true,
 'https://images.unsplash.com/photo-1630575015524-a4b1f11164d7?q=80&w=900&auto=format&fit=crop',
 'Vainilla, manzana y lavanda. Un elixir nocturno burbujeante, dulce y seductor, ideal para las horas doradas.',
 '{
    "salida":   ["Manzana","Vainilla","Bergamota","Lavanda"],
    "corazon":  ["Chocolat blanco","Jengibre","Naranja amarga"],
    "fondo":    ["Vainilla tonka","Almizcle","Sándalo","Caramelo"]
 }'::jsonb,
 array['Afnan','Dulce'], 'AFNAN-9PM', false, true),

-- 9. Fakhar Black — Lattafa — precio regular, stock medio
('Fakhar Black', 'Lattafa', 230000, null, false, 12, 100, true,
 'https://images.unsplash.com/photo-1589364054330-63314475d200?q=80&w=900&auto=format&fit=crop',
 'Versátil, elegante y fresco. Una firma olfativa moderna y limpia, perfecta para el uso diario con carácter.',
 '{
    "salida":   ["Bergamota","Ginger","Mandarina","Marine"],
    "corazon":  ["Lavanda","Salvia","Geranio","Manzana verde"],
    "fondo":    ["Vetiver","Cedro","Pachulí","Almizcle"]
 }'::jsonb,
 array['Lattafa','Fresco'], 'LTTF-FAKHAR-BLK', false, true),

-- 10. Supremacy Not Only Intense — Afnan — precio regular, stock bajo (casi agotado)
('Supremacy Not Only Intense', 'Afnan', 420000, null, false, 3, 100, true,
 'https://images.unsplash.com/photo-1590606500749-88a02232980c?q=80&w=900&auto=format&fit=crop',
 'Grosellas negras y musgo de roble. Un extracto puro, verde y magnético, con proyección de bestia.',
 '{
    "salida":   ["Grosella negra","Bergamota","Manzana","Cassis"],
    "corazon":  ["Rosa","Jazmín","Pachulí","Abedul"],
    "fondo":    ["Musgo de roble","Almizcle","Vainilla","Ambroxan"]
 }'::jsonb,
 array['Afnan','Fresco','Oud'], 'AFNAN-SUPREM-INT', false, true),

-- 11. Ameer Al Oudh — Lattafa — EN OFERTA
('Ameer Al Oudh', 'Lattafa', 210000, 179000, true, 14, 100, true,
 'https://images.unsplash.com/photo-1557171554-9e569a6304d2?q=80&w=900&auto=format&fit=crop',
 'Madera ahumada, azúcar y oud. El príncipe del oud dulce: accesible en precio, real en carácter.',
 '{
    "salida":   ["Oud dulce","Madera ahumada","Whisky"],
    "corazon":  ["Azúcar de caña","Sándalo","Cedro"],
    "fondo":    ["Vainilla","Almizcle","Resina","Ámbar"]
 }'::jsonb,
 array['Lattafa','Oud','Dulce'], 'LTTF-AMEER-OUDH', false, true)
on conflict (sku) do update set
    nombre               = excluded.nombre,
    marca                = excluded.marca,
    precio_regular       = excluded.precio_regular,
    precio_descuento     = excluded.precio_descuento,
    en_oferta            = excluded.en_oferta,
    stock_disponible     = excluded.stock_disponible,
    volumen_ml           = excluded.volumen_ml,
    activo               = excluded.activo,
    url_imagen           = excluded.url_imagen,
    descripcion          = excluded.descripcion,
    notas_olfativas      = excluded.notas_olfativas,
    categoria            = excluded.categoria,
    destacado            = excluded.destacado,
    updated_at           = now();

-- ============================================================================
--  SEED · Cupones de prueba
-- ============================================================================
insert into public.cupones (codigo, porcentaje_descuento, activo, limite_usos, usos_actuales, fecha_expiracion) values
('SULTAN10', 10, true, 100, 0, '2026-12-31 23:59:59-03'),
('ELIXIR15', 15, true, 50,  0, '2026-12-31 23:59:59-03'),
('DUBAI20',  20, true, 20,  0, '2026-12-31 23:59:59-03')
on conflict (codigo) do nothing;

-- ============================================================================
--  (Opcional) Row Level Security
--  Activa estas políticas cuando la app pase a producción:
-- ----------------------------------------------------------------------------
-- alter table public.perfumes         enable row level security;
-- alter table public.cupones          enable row level security;
-- alter table public.perfiles_usuario enable row level security;
-- alter table public.pedidos          enable row level security;
--
-- create policy "Lectura pública de perfumes activos"
--     on public.perfumes for select
--     using (activo = true);
--
-- create policy "Lectura pública de cupones activos"
--     on public.cupones for select
--     using (activo = true and usos_actuales < limite_usos);
-- ============================================================================

-- ============================================================================
--  MIGRACIÓN · Columnas nuevas (v3): es_demo + clicks_mensuales
--  + Tabla config_proveedores para gestión de APIs externas.
--  Idempotente: se puede correr varias veces sin romper.
-- ============================================================================
alter table public.perfumes
    add column if not exists es_dropi         boolean not null default false,
    add column if not exists es_demo          boolean not null default false,
    add column if not exists clicks_mensuales integer not null default 0;

-- Tabla de proveedores (Dropi y similares)
create table if not exists public.config_proveedores (
    id                    uuid primary key default gen_random_uuid(),
    proveedor             text        not null default 'Dropi Paraguay',
    api_url               text,
    api_key               text,
    sincronizar_diario    boolean     not null default false,
    ultimo_sync           timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

-- Backfill: cualquier perfume con SKU DROPI- queda marcado como Dropi.
update public.perfumes
   set es_dropi = true
 where sku is not null and sku like 'DROPI-%';

-- ============================================================================
--  FIN DEL SCRIPT
-- ============================================================================
