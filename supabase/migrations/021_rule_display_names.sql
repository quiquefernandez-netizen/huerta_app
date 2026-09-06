create or replace function public.list_reconciliation_rules()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede consultar reglas.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id::text, 'pattern', r.pattern, 'matchType', r.match_type, 'familyId', r.family_id::text, 'familyName', f.name, 'categoryId', r.category_id::text, 'categoryName', c.name, 'priority', r.priority, 'active', r.active) order by r.priority, r.created_at) from public.reglas_conciliacion r left join public.familias f on f.id=r.family_id left join public.categorias c on c.id=r.category_id), '[]'::jsonb);
end; $$;
