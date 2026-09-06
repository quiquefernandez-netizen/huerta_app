create or replace function public.list_reconciliation_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede consultar reglas.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id::text, 'pattern', pattern, 'matchType', match_type, 'familyId', family_id::text, 'categoryId', category_id::text, 'priority', priority, 'active', active) order by priority, created_at) from public.reglas_conciliacion), '[]'::jsonb);
end; $$;
revoke all on function public.list_reconciliation_rules() from public, anon;
grant execute on function public.list_reconciliation_rules() to authenticated;
