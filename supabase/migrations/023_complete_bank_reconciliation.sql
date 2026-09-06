-- Cierra el ciclo de conciliación: una asignación bancaria genera o actualiza
-- el documento económico correspondiente de forma idempotente.

alter table public.aportaciones
  add column if not exists bank_movement_id uuid references public.movimientos_bancarios(id) on delete restrict,
  add column if not exists created_from_bank boolean not null default false;

alter table public.gastos
  add column if not exists bank_movement_id uuid references public.movimientos_bancarios(id) on delete restrict,
  add column if not exists created_from_bank boolean not null default false;

create unique index if not exists aportaciones_bank_movement_unique
  on public.aportaciones (bank_movement_id);
create unique index if not exists gastos_bank_movement_unique
  on public.gastos (bank_movement_id);

create or replace function public.assign_bank_movement(
  p_id uuid,
  p_family_id uuid default null,
  p_expense_id uuid default null,
  p_category_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.movimientos_bancarios%rowtype;
  v_category_id uuid;
  v_category_name text;
  v_expense_id uuid;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede asignar movimientos bancarios.' using errcode = '42501';
  end if;
  select * into v_movement from public.movimientos_bancarios where id = p_id for update;
  if not found then
    raise exception 'El movimiento bancario no existe.' using errcode = '22023';
  end if;
  if pg_catalog.num_nonnulls(p_family_id, p_expense_id, nullif(pg_catalog.btrim(p_category_name), '')) > 1 then
    raise exception 'Un movimiento solo puede tener un destino.' using errcode = '22023';
  end if;
  if p_family_id is not null and v_movement.amount_cents <= 0 then
    raise exception 'Solo los ingresos pueden asignarse a una familia.' using errcode = '22023';
  end if;
  if (p_expense_id is not null or nullif(pg_catalog.btrim(p_category_name), '') is not null) and v_movement.amount_cents >= 0 then
    raise exception 'Solo las salidas pueden asignarse como gasto.' using errcode = '22023';
  end if;
  if p_family_id is not null and not exists (select 1 from public.familias where id = p_family_id and active) then
    raise exception 'La familia seleccionada no existe o está inactiva.' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (select 1 from public.gastos where id = p_expense_id) then
    raise exception 'El gasto seleccionado no existe.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_category_name), '') is not null then
    select id, name into v_category_id, v_category_name
    from public.categorias
    where active and type = 'GASTO' and lower(name) = lower(pg_catalog.btrim(p_category_name))
    limit 1;
    if v_category_id is null then
      raise exception 'La categoría seleccionada no existe o está inactiva.' using errcode = '22023';
    end if;
  end if;

  -- Deshacer únicamente documentos creados por una conciliación anterior.
  delete from public.aportaciones where bank_movement_id = p_id;
  update public.gastos set bank_movement_id = null
    where bank_movement_id = p_id and not created_from_bank;
  delete from public.gastos where bank_movement_id = p_id and created_from_bank;

  if p_family_id is not null then
    insert into public.aportaciones (
      family_id, received_at, amount_cents, type, concept, notes,
      bank_movement_id, created_from_bank
    ) values (
      p_family_id, v_movement.operation_date, v_movement.amount_cents,
      'ORDINARIA', v_movement.concept, nullif(pg_catalog.btrim(p_notes), ''),
      p_id, true
    );
  elsif v_category_id is not null then
    insert into public.gastos (
      spent_at, concept, amount_cents, category_id, provider, notes,
      created_by, payment_source, bank_movement_id, created_from_bank
    ) values (
      v_movement.operation_date, v_movement.concept, pg_catalog.abs(v_movement.amount_cents),
      v_category_id, 'Extracto bancario', nullif(pg_catalog.btrim(p_notes), ''),
      (select auth.uid()), 'COMMUNITY', p_id, true
    ) returning id into v_expense_id;
  elsif p_expense_id is not null then
    update public.gastos set bank_movement_id = p_id where id = p_expense_id;
    v_expense_id := p_expense_id;
  end if;

  update public.movimientos_bancarios
  set family_id = p_family_id,
      expense_id = v_expense_id,
      category_id = v_category_id,
      assignment_status = case when p_family_id is not null or v_expense_id is not null then 'ASIGNADO' else 'PENDIENTE' end,
      notes = nullif(pg_catalog.btrim(p_notes), ''),
      assigned_by = (select auth.uid()),
      assigned_at = case when p_family_id is not null or v_expense_id is not null then pg_catalog.now() else null end
  where id = p_id
  returning * into v_movement;

  return pg_catalog.jsonb_build_object(
    'id', v_movement.id::text,
    'familyId', v_movement.family_id::text,
    'expenseId', v_movement.expense_id::text,
    'categoryName', coalesce(v_category_name, ''),
    'assignmentStatus', v_movement.assignment_status,
    'notes', coalesce(v_movement.notes, '')
  );
end;
$$;

-- Adaptamos las dos asignaciones verificadas antes de esta migración.
insert into public.aportaciones (
  family_id, received_at, amount_cents, type, concept, notes,
  bank_movement_id, created_from_bank
)
select movement.family_id, movement.operation_date, movement.amount_cents,
  'ORDINARIA', movement.concept, movement.notes, movement.id, true
from public.movimientos_bancarios movement
where movement.amount_cents > 0 and movement.family_id is not null
on conflict (bank_movement_id) do nothing;

do $$
declare
  v_movement record;
  v_expense_id uuid;
begin
  for v_movement in
    select * from public.movimientos_bancarios
    where amount_cents < 0 and category_id is not null and expense_id is null
  loop
    insert into public.gastos (
      spent_at, concept, amount_cents, category_id, provider, notes,
      payment_source, bank_movement_id, created_from_bank
    ) values (
      v_movement.operation_date, v_movement.concept, pg_catalog.abs(v_movement.amount_cents),
      v_movement.category_id, 'Extracto bancario', v_movement.notes,
      'COMMUNITY', v_movement.id, true
    )
    on conflict (bank_movement_id) do update set category_id = excluded.category_id
    returning id into v_expense_id;
    update public.movimientos_bancarios set expense_id = v_expense_id where id = v_movement.id;
  end loop;
end;
$$;

drop function if exists public.create_reconciliation_rule(text, text, uuid, uuid, integer, text);

create function public.create_reconciliation_rule(
  p_pattern text,
  p_match_type text default 'CONTAINS',
  p_family_id uuid default null,
  p_category_id uuid default null,
  p_category_name text default null,
  p_priority integer default 100,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.reglas_conciliacion%rowtype;
  v_category_id uuid := p_category_id;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede crear reglas.' using errcode = '42501'; end if;
  if p_pattern is null or pg_catalog.length(pg_catalog.btrim(p_pattern)) < 2 then raise exception 'El patrón debe tener al menos dos caracteres.' using errcode = '22023'; end if;
  if p_match_type not in ('CONTAINS', 'EXACT') or p_priority is null or p_priority < 0 then raise exception 'La regla no es válida.' using errcode = '22023'; end if;
  if v_category_id is null and nullif(pg_catalog.btrim(p_category_name), '') is not null then
    select id into v_category_id from public.categorias where active and type = 'GASTO' and lower(name) = lower(pg_catalog.btrim(p_category_name)) limit 1;
  end if;
  if p_family_id is null and v_category_id is null then raise exception 'Indica una familia o una categoría de destino.' using errcode = '22023'; end if;
  if p_family_id is not null and v_category_id is not null then raise exception 'Una regla solo puede tener un destino.' using errcode = '22023'; end if;
  if p_family_id is not null and not exists (select 1 from public.familias where id = p_family_id and active) then raise exception 'La familia no existe o está inactiva.' using errcode = '22023'; end if;
  if v_category_id is not null and not exists (select 1 from public.categorias where id = v_category_id and active and type = 'GASTO') then raise exception 'La categoría no existe o está inactiva.' using errcode = '22023'; end if;
  insert into public.reglas_conciliacion (pattern, match_type, family_id, category_id, priority, notes, created_by)
  values (pg_catalog.btrim(p_pattern), p_match_type, p_family_id, v_category_id, p_priority, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid()))
  returning * into v_rule;
  return pg_catalog.jsonb_build_object('id', v_rule.id::text, 'pattern', v_rule.pattern, 'matchType', v_rule.match_type, 'familyId', v_rule.family_id::text, 'categoryId', v_rule.category_id::text, 'priority', v_rule.priority, 'active', v_rule.active);
end;
$$;

create or replace function public.update_reconciliation_rule(
  p_id uuid,
  p_pattern text,
  p_match_type text,
  p_family_id uuid default null,
  p_category_id uuid default null,
  p_category_name text default null,
  p_priority integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.reglas_conciliacion%rowtype;
  v_category_id uuid := p_category_id;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar reglas.' using errcode = '42501'; end if;
  if p_pattern is null or pg_catalog.length(pg_catalog.btrim(p_pattern)) < 2 or p_match_type not in ('CONTAINS', 'EXACT') or p_priority < 0 then raise exception 'La regla no es válida.' using errcode = '22023'; end if;
  if v_category_id is null and nullif(pg_catalog.btrim(p_category_name), '') is not null then
    select id into v_category_id from public.categorias where active and type = 'GASTO' and lower(name) = lower(pg_catalog.btrim(p_category_name)) limit 1;
  end if;
  if pg_catalog.num_nonnulls(p_family_id, v_category_id) <> 1 then raise exception 'Una regla debe tener un único destino.' using errcode = '22023'; end if;
  update public.reglas_conciliacion
  set pattern = pg_catalog.btrim(p_pattern), match_type = p_match_type,
      family_id = p_family_id, category_id = v_category_id,
      priority = p_priority, updated_at = pg_catalog.now()
  where id = p_id returning * into v_rule;
  if not found then raise exception 'La regla no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_rule.id::text, 'pattern', v_rule.pattern, 'matchType', v_rule.match_type, 'familyId', v_rule.family_id::text, 'categoryId', v_rule.category_id::text, 'priority', v_rule.priority, 'active', v_rule.active);
end;
$$;

create or replace function public.apply_reconciliation_rules()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match record;
  v_count integer := 0;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede aplicar reglas.' using errcode = '42501'; end if;
  for v_match in
    select movement.id, rule.family_id, category.name as category_name
    from public.movimientos_bancarios movement
    cross join lateral (
      select candidate.* from public.reglas_conciliacion candidate
      where candidate.active
        and ((movement.amount_cents > 0 and candidate.family_id is not null) or (movement.amount_cents < 0 and candidate.category_id is not null))
        and case candidate.match_type
          when 'EXACT' then lower(pg_catalog.btrim(movement.concept)) = lower(pg_catalog.btrim(candidate.pattern))
          else pg_catalog.strpos(lower(movement.concept), lower(candidate.pattern)) > 0
        end
      order by candidate.priority, pg_catalog.length(candidate.pattern) desc, candidate.created_at
      limit 1
    ) rule
    left join public.categorias category on category.id = rule.category_id
    where movement.assignment_status = 'PENDIENTE'
    order by movement.operation_date, movement.created_at
  loop
    perform public.assign_bank_movement(v_match.id, v_match.family_id, null, v_match.category_name, 'Asignado por regla');
    v_count := v_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object('assigned', v_count);
end;
$$;

revoke all on function public.create_reconciliation_rule(text, text, uuid, uuid, text, integer, text) from public, anon;
revoke all on function public.update_reconciliation_rule(uuid, text, text, uuid, uuid, text, integer) from public, anon;
revoke all on function public.apply_reconciliation_rules() from public, anon;
grant execute on function public.create_reconciliation_rule(text, text, uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.update_reconciliation_rule(uuid, text, text, uuid, uuid, text, integer) to authenticated;
grant execute on function public.apply_reconciliation_rules() to authenticated;
