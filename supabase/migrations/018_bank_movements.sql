-- Banco: lotes de importación y movimientos normalizados.
-- El cliente nunca escribe estas tablas directamente: toda mutación pasa por
-- RPCs protegidas y solo administración puede importar o asignar.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete restrict,
  operation_date date not null,
  value_date date,
  concept text not null,
  amount_cents integer not null,
  currency text not null default 'EUR',
  balance_cents integer,
  movement_number text,
  office text,
  reference text,
  fingerprint text not null unique,
  family_id uuid references public.familias(id) on delete set null,
  expense_id uuid references public.gastos(id) on delete set null,
  assignment_status text not null default 'PENDIENTE'
    check (assignment_status in ('PENDIENTE', 'ASIGNADO')),
  notes text,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_bancarios_operation_date_idx
  on public.movimientos_bancarios (operation_date desc);
create index if not exists movimientos_bancarios_assignment_status_idx
  on public.movimientos_bancarios (assignment_status);
create index if not exists movimientos_bancarios_family_idx
  on public.movimientos_bancarios (family_id);
create index if not exists movimientos_bancarios_expense_idx
  on public.movimientos_bancarios (expense_id);

alter table public.import_batches enable row level security;
alter table public.movimientos_bancarios enable row level security;
revoke all on table public.import_batches, public.movimientos_bancarios from anon, authenticated;

drop trigger if exists audit_import_batches_changes on public.import_batches;
create trigger audit_import_batches_changes
after insert or update or delete on public.import_batches
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_movimientos_bancarios_changes on public.movimientos_bancarios;
create trigger audit_movimientos_bancarios_changes
after insert or update or delete on public.movimientos_bancarios
for each row execute function public.audit_phase1_change();

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
    if pg_catalog.jsonb_typeof(v_row) <> 'object' then
      continue;
    end if;
    v_fingerprint := nullif(pg_catalog.btrim(v_row ->> 'fingerprint'), '');
    if v_fingerprint is null then
      raise exception 'Cada movimiento debe incluir una huella de duplicado.' using errcode = '22023';
    end if;

    insert into public.movimientos_bancarios (
      import_batch_id, operation_date, value_date, concept, amount_cents,
      currency, balance_cents, movement_number, office, reference, fingerprint, notes
    ) values (
      v_batch.id,
      (v_row ->> 'date')::date,
      nullif(v_row ->> 'valueDate', '')::date,
      nullif(pg_catalog.btrim(v_row ->> 'concept'), ''),
      (v_row ->> 'amountCents')::integer,
      coalesce(nullif(pg_catalog.btrim(v_row ->> 'currency'), ''), 'EUR'),
      nullif(v_row ->> 'balanceCents', '')::integer,
      nullif(pg_catalog.btrim(v_row ->> 'movementNumber'), ''),
      nullif(pg_catalog.btrim(v_row ->> 'office'), ''),
      nullif(pg_catalog.btrim(v_row ->> 'reference'), ''),
      v_fingerprint,
      nullif(pg_catalog.btrim(v_row ->> 'notes'), '')
    )
    on conflict (fingerprint) do nothing
    returning id into v_movement_id;

    if v_movement_id is null then
      v_duplicates := v_duplicates + 1;
    else
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.import_batches
  set row_count = v_rows_count, imported_count = v_inserted, duplicate_count = v_duplicates
  where id = v_batch.id;

  return pg_catalog.jsonb_build_object(
    'batchId', v_batch.id::text,
    'source', v_batch.source_name,
    'rows', v_rows_count,
    'imported', v_inserted,
    'duplicates', v_duplicates
  );
exception when others then
  -- No se deja un lote aparentemente válido si falla una fila.
  if v_batch.id is not null then
    delete from public.import_batches where id = v_batch.id;
  end if;
  raise;
end;
$$;

create or replace function public.assign_bank_movement(
  p_id uuid,
  p_family_id uuid default null,
  p_expense_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.movimientos_bancarios%rowtype;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede asignar movimientos bancarios.' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Indica el movimiento que quieres asignar.' using errcode = '22023';
  end if;
  if p_family_id is not null and not exists (select 1 from public.familias where id = p_family_id and active) then
    raise exception 'La familia seleccionada no existe o está inactiva.' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (select 1 from public.gastos where id = p_expense_id) then
    raise exception 'El gasto seleccionado no existe.' using errcode = '22023';
  end if;

  update public.movimientos_bancarios
  set family_id = p_family_id,
      expense_id = p_expense_id,
      assignment_status = case when p_family_id is not null or p_expense_id is not null then 'ASIGNADO' else 'PENDIENTE' end,
      notes = nullif(pg_catalog.btrim(p_notes), ''),
      assigned_by = (select auth.uid()),
      assigned_at = case when p_family_id is not null or p_expense_id is not null then pg_catalog.now() else null end
  where id = p_id
  returning * into v_movement;
  if not found then
    raise exception 'El movimiento bancario no existe.' using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_movement.id::text,
    'familyId', v_movement.family_id::text,
    'expenseId', v_movement.expense_id::text,
    'assignmentStatus', v_movement.assignment_status,
    'notes', coalesce(v_movement.notes, '')
  );
end;
$$;

-- El snapshot mantiene un único punto de lectura para ambos perfiles.
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
        'assignmentStatus', movement.assignment_status,
        'notes', coalesce(movement.notes, ''),
        'createdAt', movement.created_at
      ) order by movement.operation_date desc, movement.created_at desc), '[]'::jsonb)
      from public.movimientos_bancarios movement
    )
  );
end;
$$;

revoke all on function public.import_bank_movements(text, jsonb) from public, anon;
revoke all on function public.assign_bank_movement(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.get_community_snapshot() from public, anon;
grant execute on function public.import_bank_movements(text, jsonb) to authenticated;
grant execute on function public.assign_bank_movement(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.get_community_snapshot() to authenticated;
