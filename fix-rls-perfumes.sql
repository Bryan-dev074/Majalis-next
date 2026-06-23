-- ============================================================================
--  FIX · Habilitar RLS en public.perfumes  (Sultan Oud Elixir)
--  Síntoma que corrige: Supabase → Advisors → Security advierte
--    "RLS Disabled in Public" sobre la tabla public.perfumes.
--
--  Por qué pasa: la tabla perfumes queda expuesta vía la API pública de
--  Supabase (PostgREST). Con la clave anon (que es pública en el navegador)
--  cualquiera podría leer TODOS los productos —incluidos los inactivos/ocultos
--  o futuros borradores— y, si una policy lo permitiera, escribir.
--
--  Qué hace este script:
--    1) Habilita Row Level Security en perfumes.
--    2) Crea una policy de SOLO LECTURA pública, pero únicamente para los
--       productos activos (activo = true). Así la tienda ve el catálogo
--       pero los productos ocultos/inactivos quedan protegidos.
--    3) NO crea policy de escritura para anon: la tienda nunca escribe.
--       El panel /admin escribe con la CLAVE SECRETA (service_role), que
--       IGNORA el RLS por diseño → sigue funcionando exactamente igual.
--
--  Ejecutar en: Supabase → SQL Editor → New query → pegar todo → RUN.
--  Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

-- 1) Habilitar RLS en la tabla de productos.
alter table public.perfumes enable row level security;

-- 2) Policy de LECTURA pública: el rol anon (tienda) solo ve productos activos.
--    "force replace" evita duplicar la policy si se corre más de una vez.
drop policy if exists "catalogo_publico_solo_activos" on public.perfumes;
create policy "catalogo_publico_solo_activos"
  on public.perfumes
  for select
  to anon, authenticated
  using (activo = true);

-- 3) Recordatorio de seguridad:
--    · El panel /admin usa service_role → RLS no le aplica, acceso total.
--    · La tienda usa anon → solo SELECT de activos. No hay INSERT/UPDATE/DELETE públicos.
--    · Si más adelante querés que usuarios logueados (authenticated) vean
--      productos ocultos, agregá otra policy con la condición que necesites.

-- ── Verificación (opcional): debiera mostrar la policy creada.
select polname as policy, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'perfumes';
