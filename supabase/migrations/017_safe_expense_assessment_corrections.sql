-- Correcciones seguras de gastos y derramas existentes.
-- Ambos perfiles pueden corregir un dato equivocado, pero nadie puede eliminarlo.

create or replace function public.update_expense(
  p_expense_id uuid,
  p_spent_at date,
  p_concept text,
  p_amount_cents integer,
  p_category_name text,
  p_provider text default null,
  p_notes text default null,
  p_payment_source text default 'COMMUNITY',
  p_payers jsonb default '[]'::jsonb
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
  v_family_id uuid;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'Necesitas una sesión activa para corregir un gasto.' using errcode = '42501';
  end if;
  if p_expense_id is null or p_spent_at is null or nullif(pg_catalog.btrim(p_concept), '') is null
    or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'La fecha, el concepto y un importe válido son obligatorios.' using errcode = '22023';
  end if;
  if p_payment_source not in ('COMMUNITY', 'FAMILIES') or pg_catalog.jsonb_typeof(p_payers) <> 'array' then
    raise exception 'El origen del pago no es válido.' using errcode = '22023';
  end if;
  select id into v_category_id from public.categorias
    where name = p_category_name and type = 'GASTO' and active;
  if v_category_id is null then
    raise exception 'La categoría de gasto no existe o está desactivada.' using errcode = '22023';
  end if;
  select * into v_expense from public.gastos where id = p_expense_id for update;
  if not found then raise exception 'El gasto no existe.' using errcode = '22023'; end if;
  if p_payment_source = 'COMMUNITY' and pg_catalog.jsonb_array_length(p_payers) <> 0 then
    raise exception 'Un gasto pagado por la comunidad no puede tener pagadores familiares.' using errcode = '22023';
  end if;
  if p_payment_source = 'FAMILIES' then
    for v_item in select * from pg_catalog.jsonb_array_elements(p_payers) loop
      begin v_family_id := (v_item->>'familyId')::uuid;
      exception when invalid_text_representation then
        raise exception 'El reparto de pagadores no es válido.' using errcode = '22023';
      end;
      if (v_item->>'amountCents') is null or (v_item->>'amountCents')::integer <= 0
        or v_family_id is null or not exists (select 1 from public.familias where id = v_family_id and active)
        or (select count(*) from jsonb_array_elements(p_payers) duplicate where duplicate->>'familyId' = v_item->>'familyId') > 1 then
        raise exception 'El reparto de pagadores no es válido.' using errcode = '22023';
      end if;
      v_allocated := v_allocated + (v_item->>'amountCents')::integer;
    end loop;
    if v_allocated <> p_amount_cents then
      raise exception 'El reparto debe sumar exactamente el importe del gasto.' using errcode = '22023';
    end if;
  end if;
  update public.gastos set spent_at = p_spent_at, concept = pg_catalog.left(pg_catalog.btrim(p_concept), 100),
    amount_cents = p_amount_cents, category_id = v_category_id,
    provider = nullif(pg_catalog.left(pg_catalog.btrim(p_provider), 80), ''),
    notes = nullif(pg_catalog.btrim(p_notes), ''), payment_source = p_payment_source
    where id = p_expense_id returning * into v_expense;
  delete from public.gasto_pagadores where expense_id = p_expense_id;
  if p_payment_source = 'FAMILIES' then
    insert into public.gasto_pagadores (expense_id, family_id, amount_cents)
    select p_expense_id, (item->>'familyId')::uuid, (item->>'amountCents')::integer
    from pg_catalog.jsonb_array_elements(p_payers) item;
  end if;
  return pg_catalog.jsonb_build_object('id', v_expense.id::text, 'date', v_expense.spent_at,
    'concept', v_expense.concept, 'amountCents', v_expense.amount_cents, 'category', p_category_name,
    'provider', coalesce(v_expense.provider, 'Sin proveedor'), 'paymentSource', v_expense.payment_source,
    'payers', p_payers, 'notes', coalesce(v_expense.notes, ''));
end;
$$;

create or replace function public.update_assessment(
  p_assessment_id uuid,
  p_concept text,
  p_assessed_at date,
  p_total_amount_cents integer,
  p_allocations jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.derramas%rowtype;
  v_item jsonb;
  v_allocated bigint := 0;
  v_family_id uuid;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'Necesitas una sesión activa para corregir una derrama.' using errcode = '42501';
  end if;
  if p_assessment_id is null or p_assessed_at is null or nullif(pg_catalog.btrim(p_concept), '') is null
    or p_total_amount_cents is null or p_total_amount_cents <= 0
    or pg_catalog.jsonb_typeof(p_allocations) <> 'array' or pg_catalog.jsonb_array_length(p_allocations) = 0 then
    raise exception 'La derrama necesita fecha, concepto, importe y familias.' using errcode = '22023';
  end if;
  select * into v_assessment from public.derramas where id = p_assessment_id for update;
  if not found then raise exception 'La derrama no existe.' using errcode = '22023'; end if;
  if v_assessment.status = 'ANULADA' then raise exception 'No se puede corregir una derrama anulada.' using errcode = '22023'; end if;
  for v_item in select * from pg_catalog.jsonb_array_elements(p_allocations) loop
    begin v_family_id := (v_item->>'familyId')::uuid;
    exception when invalid_text_representation then
      raise exception 'El reparto de la derrama no es válido.' using errcode = '22023';
    end;
    if (v_item->>'amountCents') is null or (v_item->>'amountCents')::integer <= 0
      or v_family_id is null or not exists (select 1 from public.familias where id = v_family_id and active)
      or (select count(*) from jsonb_array_elements(p_allocations) duplicate where duplicate->>'familyId' = v_item->>'familyId') > 1 then
      raise exception 'El reparto de la derrama no es válido.' using errcode = '22023';
    end if;
    v_allocated := v_allocated + (v_item->>'amountCents')::integer;
  end loop;
  if v_allocated <> p_total_amount_cents then
    raise exception 'El reparto debe sumar exactamente el total de la derrama.' using errcode = '22023';
  end if;
  update public.derramas set assessed_at = p_assessed_at, concept = pg_catalog.left(pg_catalog.btrim(p_concept), 100),
    total_amount_cents = p_total_amount_cents, notes = nullif(pg_catalog.btrim(p_notes), '')
    where id = p_assessment_id returning * into v_assessment;
  delete from public.derrama_familias where assessment_id = p_assessment_id;
  insert into public.derrama_familias (assessment_id, family_id, amount_cents)
  select p_assessment_id, (item->>'familyId')::uuid, (item->>'amountCents')::integer
  from pg_catalog.jsonb_array_elements(p_allocations) item;
  return pg_catalog.jsonb_build_object('id', v_assessment.id::text, 'date', v_assessment.assessed_at,
    'concept', v_assessment.concept, 'totalAmountCents', v_assessment.total_amount_cents,
    'status', v_assessment.status, 'allocations', p_allocations, 'notes', coalesce(v_assessment.notes, ''));
end;
$$;

revoke all on function public.update_expense(uuid, date, text, integer, text, text, text, text, jsonb) from public, anon;
revoke all on function public.update_assessment(uuid, text, date, integer, jsonb, text) from public, anon;
grant execute on function public.update_expense(uuid, date, text, integer, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_assessment(uuid, text, date, integer, jsonb, text) to authenticated;
