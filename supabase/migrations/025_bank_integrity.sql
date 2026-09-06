-- Refuerza la idempotencia en servidor y elimina una advertencia del linter.

create or replace function public.import_bank_movements(
  p_source text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row jsonb;
  v_fingerprint text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_rows_count integer := 0;
  v_movement_id uuid;
  v_operation_date date;
  v_value_date date;
  v_concept text;
  v_amount_cents integer;
  v_balance_cents integer;
  v_reference text;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede importar movimientos bancarios.' using errcode = '42501';
  end if;
  if p_source is null or pg_catalog.btrim(p_source) = '' then
    raise exception 'Indica el nombre del extracto.' using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Las filas del extracto deben ser una lista.' using errcode = '22023';
  end if;

  insert into public.import_batches (source_name, created_by)
  values (pg_catalog.left(pg_catalog.btrim(p_source), 255), (select auth.uid()))
  returning * into v_batch;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    v_rows_count := v_rows_count + 1;
    if pg_catalog.jsonb_typeof(v_row) <> 'object' then continue; end if;

    v_fingerprint := nullif(pg_catalog.btrim(v_row ->> 'fingerprint'), '');
    if v_fingerprint is null then raise exception 'Cada movimiento debe incluir una huella de duplicado.' using errcode = '22023'; end if;
    v_operation_date := (v_row ->> 'date')::date;
    v_value_date := nullif(v_row ->> 'valueDate', '')::date;
    v_concept := nullif(pg_catalog.btrim(v_row ->> 'concept'), '');
    v_amount_cents := (v_row ->> 'amountCents')::integer;
    v_balance_cents := nullif(v_row ->> 'balanceCents', '')::integer;
    v_reference := nullif(pg_catalog.btrim(v_row ->> 'reference'), '');

    if exists (
      select 1 from public.movimientos_bancarios movement
      where movement.operation_date = v_operation_date
        and movement.value_date is not distinct from v_value_date
        and movement.amount_cents = v_amount_cents
        and movement.balance_cents is not distinct from v_balance_cents
        and lower(pg_catalog.btrim(movement.concept)) = lower(v_concept)
        and coalesce(pg_catalog.btrim(movement.reference), '') = coalesce(v_reference, '')
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    insert into public.movimientos_bancarios (
      import_batch_id, operation_date, value_date, concept, amount_cents,
      currency, balance_cents, movement_number, office, reference, fingerprint, notes
    ) values (
      v_batch.id, v_operation_date, v_value_date, v_concept, v_amount_cents,
      coalesce(nullif(pg_catalog.btrim(v_row ->> 'currency'), ''), 'EUR'),
      v_balance_cents, nullif(pg_catalog.btrim(v_row ->> 'movementNumber'), ''),
      nullif(pg_catalog.btrim(v_row ->> 'office'), ''), v_reference, v_fingerprint,
      nullif(pg_catalog.btrim(v_row ->> 'notes'), '')
    )
    on conflict (fingerprint) do nothing
    returning id into v_movement_id;

    if v_movement_id is null then v_duplicates := v_duplicates + 1;
    else v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.import_batches
  set row_count = v_rows_count, imported_count = v_inserted, duplicate_count = v_duplicates
  where id = v_batch.id;

  return pg_catalog.jsonb_build_object('batchId', v_batch.id::text, 'source', v_batch.source_name, 'rows', v_rows_count, 'imported', v_inserted, 'duplicates', v_duplicates);
exception when others then
  if v_batch.id is not null then delete from public.import_batches where id = v_batch.id; end if;
  raise;
end;
$$;

create or replace function public.revert_bank_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_removed integer;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede revertir importaciones.' using errcode = '42501'; end if;
  perform 1 from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'La importación no existe.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.gastos expense
    join public.movimientos_bancarios movement on movement.id = expense.bank_movement_id
    where movement.import_batch_id = p_batch_id and not expense.created_from_bank
  ) then
    raise exception 'Hay movimientos enlazados a gastos manuales. Corrige esas asignaciones antes de revertir.' using errcode = '23503';
  end if;
  delete from public.aportaciones contribution using public.movimientos_bancarios movement
    where contribution.bank_movement_id = movement.id and movement.import_batch_id = p_batch_id;
  delete from public.gastos expense using public.movimientos_bancarios movement
    where expense.bank_movement_id = movement.id and expense.created_from_bank and movement.import_batch_id = p_batch_id;
  delete from public.movimientos_bancarios where import_batch_id = p_batch_id;
  get diagnostics v_removed = row_count;
  delete from public.import_batches where id = p_batch_id;
  return pg_catalog.jsonb_build_object('batchId', p_batch_id::text, 'removed', v_removed);
end;
$$;

