-- Histórico visible y reversión segura de lotes bancarios.

create or replace function public.revert_bank_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
  v_removed integer;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede revertir importaciones.' using errcode = '42501';
  end if;
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'La importación no existe.' using errcode = '22023'; end if;

  if exists (
    select 1 from public.gastos expense
    join public.movimientos_bancarios movement on movement.id = expense.bank_movement_id
    where movement.import_batch_id = p_batch_id and not expense.created_from_bank
  ) then
    raise exception 'Hay movimientos enlazados a gastos manuales. Corrige esas asignaciones antes de revertir.' using errcode = '23503';
  end if;

  delete from public.aportaciones contribution
  using public.movimientos_bancarios movement
  where contribution.bank_movement_id = movement.id and movement.import_batch_id = p_batch_id;

  delete from public.gastos expense
  using public.movimientos_bancarios movement
  where expense.bank_movement_id = movement.id
    and expense.created_from_bank
    and movement.import_batch_id = p_batch_id;

  delete from public.movimientos_bancarios where import_batch_id = p_batch_id;
  get diagnostics v_removed = row_count;
  delete from public.import_batches where id = p_batch_id;

  return pg_catalog.jsonb_build_object('batchId', p_batch_id::text, 'removed', v_removed);
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
    'expenses', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', expense.id::text,
        'date', expense.spent_at,
        'concept', expense.concept,
        'amountCents', expense.amount_cents,
        'category', category.name,
        'provider', coalesce(expense.provider, 'Sin proveedor'),
        'paymentSource', expense.payment_source,
        'payers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', payer.family_id::text, 'amountCents', payer.amount_cents)) from public.gasto_pagadores payer where payer.expense_id = expense.id), '[]'::jsonb),
        'notes', coalesce(expense.notes, ''),
        'bankMovementId', expense.bank_movement_id::text,
        'createdFromBank', expense.created_from_bank
      ) order by expense.spent_at desc, expense.created_at desc), '[]'::jsonb)
      from public.gastos expense
      join public.categorias category on category.id = expense.category_id
    ),
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
    ),
    'bankImportBatches', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', batch.id::text,
        'source', batch.source_name,
        'rowCount', batch.row_count,
        'importedCount', batch.imported_count,
        'duplicateCount', batch.duplicate_count,
        'createdAt', batch.created_at
      ) order by batch.created_at desc), '[]'::jsonb)
      from public.import_batches batch
    )
  );
end;
$$;

revoke all on function public.revert_bank_import(uuid) from public, anon;
grant execute on function public.revert_bank_import(uuid) to authenticated;

