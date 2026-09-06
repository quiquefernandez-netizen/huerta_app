-- Reglas explícitas de conciliación. No se crean automáticamente al asignar
-- un movimiento: administración debe decidir siempre cuándo guardar un patrón.

create table if not exists public.reglas_conciliacion (
  id uuid primary key default gen_random_uuid(),
  pattern text not null check (pg_catalog.length(pg_catalog.btrim(pattern)) >= 2),
  match_type text not null default 'CONTAINS' check (match_type in ('CONTAINS', 'EXACT')),
  family_id uuid references public.familias(id) on delete set null,
  category_id uuid references public.categorias(id) on delete set null,
  priority integer not null default 100 check (priority >= 0),
  active boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (family_id is not null or category_id is not null)
);

create index if not exists reglas_conciliacion_active_priority_idx
  on public.reglas_conciliacion (active, priority, created_at);
create unique index if not exists reglas_conciliacion_unique_target_pattern
  on public.reglas_conciliacion (lower(pattern), match_type, coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.reglas_conciliacion enable row level security;
revoke all on table public.reglas_conciliacion from anon, authenticated;

drop trigger if exists audit_reglas_conciliacion_changes on public.reglas_conciliacion;
create trigger audit_reglas_conciliacion_changes
after insert or update or delete on public.reglas_conciliacion
for each row execute function public.audit_phase1_change();

create or replace function public.create_reconciliation_rule(
  p_pattern text,
  p_match_type text default 'CONTAINS',
  p_family_id uuid default null,
  p_category_id uuid default null,
  p_priority integer default 100,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_rule public.reglas_conciliacion%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede crear reglas.' using errcode = '42501'; end if;
  if p_pattern is null or pg_catalog.length(pg_catalog.btrim(p_pattern)) < 2 then raise exception 'El patrón debe tener al menos dos caracteres.' using errcode = '22023'; end if;
  if p_match_type not in ('CONTAINS', 'EXACT') or p_priority is null or p_priority < 0 then raise exception 'La regla no es válida.' using errcode = '22023'; end if;
  if p_family_id is null and p_category_id is null then raise exception 'Indica una familia o una categoría de destino.' using errcode = '22023'; end if;
  if p_family_id is not null and not exists (select 1 from public.familias where id = p_family_id and active) then raise exception 'La familia no existe o está inactiva.' using errcode = '22023'; end if;
  if p_category_id is not null and not exists (select 1 from public.categorias where id = p_category_id and active and type = 'GASTO') then raise exception 'La categoría no existe o está inactiva.' using errcode = '22023'; end if;
  insert into public.reglas_conciliacion (pattern, match_type, family_id, category_id, priority, notes, created_by)
  values (pg_catalog.btrim(p_pattern), p_match_type, p_family_id, p_category_id, p_priority, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid()))
  returning * into v_rule;
  return pg_catalog.jsonb_build_object('id', v_rule.id::text, 'pattern', v_rule.pattern, 'matchType', v_rule.match_type, 'familyId', v_rule.family_id::text, 'categoryId', v_rule.category_id::text, 'priority', v_rule.priority, 'active', v_rule.active, 'notes', coalesce(v_rule.notes, ''));
end;
$$;

create or replace function public.set_reconciliation_rule_active(p_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_rule public.reglas_conciliacion%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar reglas.' using errcode = '42501'; end if;
  update public.reglas_conciliacion set active = coalesce(p_active, false), updated_at = pg_catalog.now() where id = p_id returning * into v_rule;
  if not found then raise exception 'La regla no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_rule.id::text, 'active', v_rule.active);
end;
$$;

create or replace function public.delete_reconciliation_rule(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar reglas.' using errcode = '42501'; end if;
  delete from public.reglas_conciliacion where id = p_id;
  return found;
end;
$$;

revoke all on function public.create_reconciliation_rule(text, text, uuid, uuid, integer, text) from public, anon;
revoke all on function public.set_reconciliation_rule_active(uuid, boolean) from public, anon;
revoke all on function public.delete_reconciliation_rule(uuid) from public, anon;
grant execute on function public.create_reconciliation_rule(text, text, uuid, uuid, integer, text) to authenticated;
grant execute on function public.set_reconciliation_rule_active(uuid, boolean) to authenticated;
grant execute on function public.delete_reconciliation_rule(uuid) to authenticated;
