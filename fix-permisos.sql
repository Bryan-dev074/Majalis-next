-- ============================================================================
--  FIX · Permisos de los roles de la API de Supabase  (Sultan Oud Elixir)
--  Síntoma que corrige: "permission denied for table perfumes"
--  Causa: schema.sql crea las tablas pero nunca otorgó GRANTs a los roles
--         service_role (panel /admin) ni anon (tienda).
--
--  Ejecutar en: Supabase → SQL Editor → New query → pegar todo → RUN
--  Es seguro y idempotente: se puede correr varias veces sin romper nada.
--  Afecta a la base compartida → arregla LOCAL y PRODUCCIÓN al mismo tiempo.
-- ============================================================================

-- 1) Acceso al esquema public para los 3 roles de la API
grant usage on schema public to anon, authenticated, service_role;

-- 2) El panel /admin usa la CLAVE SECRETA (rol service_role) → acceso TOTAL
--    (es server-only, por eso puede tener todos los permisos)
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- 3) La tienda usa la CLAVE PÚBLICA (rol anon) → SOLO LECTURA del catálogo
--    (NO se le da insert/update/delete: la anon key es visible en el navegador)
grant select on table public.perfumes to anon, authenticated;

-- 4) Que las tablas/secuencias FUTURAS hereden los permisos automáticamente
alter default privileges in schema public grant all    on tables    to service_role;
alter default privileges in schema public grant all    on sequences to service_role;
alter default privileges in schema public grant select on tables    to anon, authenticated;

-- ── Verificación (opcional): debería listar service_role con varios permisos
--    y anon con SELECT sobre perfumes.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'perfumes'
order by grantee, privilege_type;
