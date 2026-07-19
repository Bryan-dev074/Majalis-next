-- Incremento atómico del contador público. Evita perder clics por dos
-- actualizaciones simultáneas y no expone permisos de escritura al navegador.
create or replace function public.incrementar_click_perfume(p_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.perfumes
  set clicks_mensuales = coalesce(clicks_mensuales, 0) + 1
  where id = p_id
  returning clicks_mensuales;
$$;

revoke all on function public.incrementar_click_perfume(uuid) from public;
revoke all on function public.incrementar_click_perfume(uuid) from anon;
revoke all on function public.incrementar_click_perfume(uuid) from authenticated;
grant execute on function public.incrementar_click_perfume(uuid) to service_role;
