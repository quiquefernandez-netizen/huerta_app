-- Permite conciliar salidas bancarias directamente contra una categoría de
-- gasto, además de enlazarlas con un gasto ya registrado.

alter table public.movimientos_bancarios
  add column if not exists category_id uuid references public.categorias(id) on delete set null;

create index if not exists movimientos_bancarios_category_idx
  on public.movimientos_bancarios (category_id);

drop function if exists public.assign_bank_movement(uuid, uuid, uuid, text);

create function public.assign_bank_movement(
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
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede asignar movimientos bancarios.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Indica el movimiento que quieres asignar.' using errcode = '22023';
  end if;
  if pg_catalog.num_nonnulls(p_family_id, p_expense_id, nullif(pg_catalog.btrim(p_category_name), '')) > 1 then
    raise exception 'Un movimiento solo puede tener un destino.' using errcode = '22023';
  end if;
  if p_family_id is not null and not exists (select 1 from public.familias where id = p_family_id and active) then
    raise exception 'La familia seleccionada no existe o está inactiva.' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (select 1 from public.gastos where id = p_expense_id) then
    raise exception 'El gasto seleccionado no existe.' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_category_name), '') is not null then
    select id into v_category_id
    from public.categorias
    where active and type = 'GASTO' and lower(name) = lower(pg_catalog.btrim(p_category_name))
    limit 1;
    if v_category_id is null then
      raise exception 'La categoría seleccionada no existe o está inactiva.' using errcode = '22023';
    end if;
  end if;

  update public.movimientos_bancarios
  set family_id = p_family_id,
      expense_id = p_expense_id,
      category_id = v_category_id,
      assignment_status = case when p_family_id is not null or p_expense_id is not null or v_category_id is not null then 'ASIGNADO' else 'PENDIENTE' end,
      notes = nullif(pg_catalog.btrim(p_notes), ''),
      assigned_by = (select auth.uid()),
      assigned_at = case when p_family_id is not null or p_expense_id is not null or v_category_id is not null then pg_catalog.now() else null end
  where id = p_id
  returning * into v_movement;
  if not found then
    raise exception 'El movimiento bancario no existe.' using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_movement.id::text,
    'familyId', v_movement.family_id::text,
    'expenseId', v_movement.expense_id::text,
    'categoryName', coalesce((select name from public.categorias where id = v_movement.category_id), ''),
    'assignmentStatus', v_movement.assignment_status,
    'notes', coalesce(v_movement.notes, '')
  );
end;
$$;

create or replace function public.get_community_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_snapshot jsonb;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'Necesitas una sesión activa para consultar la comunidad.' using errcode = '42501';
  end if;
  select public.get_community_snapshot_base() into v_snapshot;
  return v_snapshot || pg_catalog.jsonb_build_object(
    'bankMovements', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', movement.id::text,
        'batchId', movement.import_batch_id::text,
        'date', movement.operation_date,
        'valueDate', movement.value_date,
        'concept', movement.concept,
        'amountCents', movement.amount_cents,
        'currency', movement.currency,
        'balanceCents', movement.balance_cents,
        'movementNumber', coalesce(movement.movement_number, ''),
        'office', coalesce(movement.office, ''),
        'reference', coalesce(movement.reference, ''),
        'fingerprint', movement.fingerprint,
        'familyId', movement.family_id::text,
        'expenseId', movement.expense_id::text,
        'categoryName', coalesce(category.name, ''),
        'assignmentStatus', movement.assignment_status,
        'notes', coalesce(movement.notes, ''),
        'createdAt', movement.created_at
      ) order by movement.operation_date desc, movement.created_at desc), '[]'::jsonb)
      from public.movimientos_bancarios movement
      left join public.categorias category on category.id = movement.category_id
    )
  );
end;
$$;

revoke all on function public.assign_bank_movement(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.assign_bank_movement(uuid, uuid, uuid, text, text) to authenticated;

