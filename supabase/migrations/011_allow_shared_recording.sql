-- Fase 1: el perfil Normal puede registrar información nueva, pero no editar,
-- liquidar ni eliminar. Las altas pasan siempre por RPC validadas, no por
-- inserciones directas desde el navegador.

revoke insert, update, delete on table
  public.aportaciones, public.gastos, public.gasto_pagadores,
  public.derramas, public.derrama_familias, public.lecturas_agua
from authenticated;

create or replace function public.create_contribution(
  p_family_id uuid, p_received_at date, p_amount_cents integer, p_concept text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.aportaciones%rowtype;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para registrar una aportación.' using errcode = '42501'; end if;
  if p_received_at is null or p_amount_cents is null or p_amount_cents <= 0 or nullif(pg_catalog.btrim(p_concept), '') is null then
    raise exception 'Familia, fecha, concepto e importe válido son obligatorios.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.familias where id = p_family_id and active) then
    raise exception 'La familia no existe o está desactivada.' using errcode = '22023';
  end if;
  insert into public.aportaciones (family_id, received_at, amount_cents, type, concept)
  values (p_family_id, p_received_at, p_amount_cents, 'ORDINARIA', pg_catalog.left(pg_catalog.btrim(p_concept), 100))
  returning * into v_row;
  return pg_catalog.jsonb_build_object('id', v_row.id::text, 'familyId', v_row.family_id::text,
    'date', v_row.received_at, 'amountCents', v_row.amount_cents, 'concept', v_row.concept);
end;
$$;

create or replace function public.create_expense(
  p_spent_at date, p_concept text, p_amount_cents integer, p_category_name text,
  p_provider text default null, p_notes text default null,
  p_payment_source text default 'COMMUNITY', p_payers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_expense public.gastos%rowtype;
  v_item jsonb;
  v_allocated bigint := 0;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para registrar un gasto.' using errcode = '42501'; end if;
  if p_spent_at is null or nullif(pg_catalog.btrim(p_concept), '') is null or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'La fecha, el concepto y un importe válido son obligatorios.' using errcode = '22023';
  end if;
  if p_payment_source not in ('COMMUNITY', 'FAMILIES') or pg_catalog.jsonb_typeof(p_payers) <> 'array' then
    raise exception 'El origen del pago no es válido.' using errcode = '22023';
  end if;
  select id into v_category_id from public.categorias
    where name = p_category_name and type = 'GASTO' and active;
  if v_category_id is null then raise exception 'La categoría de gasto no existe o está desactivada.' using errcode = '22023'; end if;
  if p_payment_source = 'COMMUNITY' and pg_catalog.jsonb_array_length(p_payers) <> 0 then
    raise exception 'Un gasto pagado por la comunidad no puede tener pagadores familiares.' using errcode = '22023';
  end if;
  if p_payment_source = 'FAMILIES' then
    for v_item in select * from pg_catalog.jsonb_array_elements(p_payers) loop
      if (v_item->>'amountCents')::integer <= 0 or not exists (
        select 1 from public.familias where id = (v_item->>'familyId')::uuid and active
      ) then raise exception 'El reparto de pagadores no es válido.' using errcode = '22023'; end if;
      v_allocated := v_allocated + (v_item->>'amountCents')::integer;
    end loop;
    if v_allocated <> p_amount_cents then raise exception 'El reparto debe sumar exactamente el importe del gasto.' using errcode = '22023'; end if;
  end if;
  insert into public.gastos (spent_at, concept, amount_cents, category_id, provider, notes, created_by, payment_source)
  values (p_spent_at, pg_catalog.left(pg_catalog.btrim(p_concept), 100), p_amount_cents, v_category_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_provider), 80), ''), nullif(pg_catalog.btrim(p_notes), ''),
    (select auth.uid()), p_payment_source)
  returning * into v_expense;
  if p_payment_source = 'FAMILIES' then
    insert into public.gasto_pagadores (expense_id, family_id, amount_cents)
    select v_expense.id, (item->>'familyId')::uuid, (item->>'amountCents')::integer
    from pg_catalog.jsonb_array_elements(p_payers) item;
  end if;
  return pg_catalog.jsonb_build_object('id', v_expense.id::text, 'date', v_expense.spent_at,
    'concept', v_expense.concept, 'amountCents', v_expense.amount_cents, 'category', p_category_name,
    'provider', coalesce(v_expense.provider, 'Sin proveedor'), 'paymentSource', v_expense.payment_source,
    'payers', p_payers, 'notes', coalesce(v_expense.notes, ''));
end;
$$;

create or replace function public.create_assessment(
  p_concept text, p_assessed_at date, p_total_amount_cents integer,
  p_allocations jsonb, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_assessment public.derramas%rowtype; v_item jsonb; v_allocated bigint := 0;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para crear una derrama.' using errcode = '42501'; end if;
  if p_assessed_at is null or nullif(pg_catalog.btrim(p_concept), '') is null or p_total_amount_cents <= 0
    or pg_catalog.jsonb_typeof(p_allocations) <> 'array' or pg_catalog.jsonb_array_length(p_allocations) = 0 then
    raise exception 'La derrama necesita fecha, concepto, importe y familias.' using errcode = '22023';
  end if;
  for v_item in select * from pg_catalog.jsonb_array_elements(p_allocations) loop
    if (v_item->>'amountCents')::integer <= 0 or not exists (
      select 1 from public.familias where id = (v_item->>'familyId')::uuid and active
    ) then raise exception 'El reparto de la derrama no es válido.' using errcode = '22023'; end if;
    v_allocated := v_allocated + (v_item->>'amountCents')::integer;
  end loop;
  if v_allocated <> p_total_amount_cents then raise exception 'El reparto debe sumar exactamente el total de la derrama.' using errcode = '22023'; end if;
  insert into public.derramas (assessed_at, concept, total_amount_cents, status, notes, created_by)
  values (p_assessed_at, pg_catalog.left(pg_catalog.btrim(p_concept), 100), p_total_amount_cents, 'ACTIVA',
    nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid())) returning * into v_assessment;
  insert into public.derrama_familias (assessment_id, family_id, amount_cents)
  select v_assessment.id, (item->>'familyId')::uuid, (item->>'amountCents')::integer
  from pg_catalog.jsonb_array_elements(p_allocations) item;
  return pg_catalog.jsonb_build_object('id', v_assessment.id::text, 'date', v_assessment.assessed_at,
    'concept', v_assessment.concept, 'totalAmountCents', v_assessment.total_amount_cents,
    'status', v_assessment.status, 'allocations', p_allocations, 'notes', coalesce(v_assessment.notes, ''));
end;
$$;

create or replace function public.create_water_reading(
  p_family_id uuid, p_meter_id uuid, p_read_at date, p_reading_m3 numeric,
  p_observations text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_meter public.contadores%rowtype; v_previous public.lecturas_agua%rowtype; v_reading public.lecturas_agua%rowtype; v_price integer;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para registrar una lectura.' using errcode = '42501'; end if;
  if p_read_at is null or p_reading_m3 is null or p_reading_m3 < 0 then raise exception 'La fecha y una lectura válida son obligatorias.' using errcode = '22023'; end if;
  select * into v_meter from public.contadores where id = p_meter_id and active;
  if not found or v_meter.family_id <> p_family_id then raise exception 'El contador no corresponde a la familia indicada.' using errcode = '22023'; end if;
  select * into v_previous from public.lecturas_agua where meter_id = p_meter_id order by read_at desc, created_at desc limit 1;
  if found and (p_read_at <= v_previous.read_at or p_reading_m3 < v_previous.reading_m3) then
    raise exception 'La lectura debe ser posterior y no puede ser menor que la anterior.' using errcode = '22023';
  end if;
  select price_cents_m3 into v_price from public.tarifas_agua where active and valid_from <= p_read_at
    and (valid_until is null or valid_until >= p_read_at) order by valid_from desc limit 1;
  if v_price is null then raise exception 'No hay una tarifa de agua válida para esa fecha.' using errcode = '22023'; end if;
  insert into public.lecturas_agua (family_id, meter_id, read_at, reading_m3, user_id, observations)
  values (p_family_id, p_meter_id, p_read_at, p_reading_m3, (select auth.uid()), nullif(pg_catalog.btrim(p_observations), ''))
  returning * into v_reading;
  return pg_catalog.jsonb_build_object('id', v_reading.id::text, 'familyId', v_reading.family_id::text,
    'meterId', v_reading.meter_id::text, 'date', v_reading.read_at, 'readingM3', v_reading.reading_m3,
    'previousReadingM3', coalesce(v_previous.reading_m3, v_meter.initial_reading_m3),
    'appliedPriceCents', v_price, 'observations', coalesce(v_reading.observations, ''));
end;
$$;

revoke all on function public.create_contribution(uuid, date, integer, text) from public, anon;
revoke all on function public.create_expense(date, text, integer, text, text, text, text, jsonb) from public, anon;
revoke all on function public.create_assessment(text, date, integer, jsonb, text) from public, anon;
revoke all on function public.create_water_reading(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.create_contribution(uuid, date, integer, text) to authenticated;
grant execute on function public.create_expense(date, text, integer, text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_assessment(text, date, integer, jsonb, text) to authenticated;
grant execute on function public.create_water_reading(uuid, uuid, date, numeric, text) to authenticated;
