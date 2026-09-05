-- Contrato final de Fase 1 para la UI actual y el acceso compartido.

grant select, insert, update, delete on table
  public.planes_cuota, public.lotes_liquidacion_agua,
  public.gasto_pagadores, public.derramas, public.derrama_familias
to authenticated;
grant select on table public.movimientos_cuenta_familia to authenticated;
revoke all on table
  public.planes_cuota, public.lotes_liquidacion_agua,
  public.gasto_pagadores, public.derramas, public.derrama_familias
from anon;
revoke all on table public.movimientos_cuenta_familia from anon;

create policy planes_cuota_active_select on public.planes_cuota for select to authenticated
  using ((select public.current_user_is_active()));
create policy planes_cuota_admin_write on public.planes_cuota for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy lotes_agua_active_select on public.lotes_liquidacion_agua for select to authenticated
  using ((select public.current_user_is_active()));
create policy lotes_agua_admin_write on public.lotes_liquidacion_agua for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy gasto_pagadores_active_select on public.gasto_pagadores for select to authenticated
  using ((select public.current_user_is_active()));
create policy gasto_pagadores_admin_write on public.gasto_pagadores for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy derramas_active_select on public.derramas for select to authenticated
  using ((select public.current_user_is_active()));
create policy derramas_admin_write on public.derramas for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy derrama_familias_active_select on public.derrama_familias for select to authenticated
  using ((select public.current_user_is_active()));
create policy derrama_familias_admin_write on public.derrama_familias for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create unique index if not exists one_monthly_fee_per_plan
  on public.cuotas (family_id, quota_plan_id, period_start)
  where quota_plan_id is not null;

create or replace function public.create_family(
  p_name text, p_short_name text, p_members integer, p_joined_at date,
  p_annual_quota_cents integer, p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family public.familias%rowtype;
  v_plan public.planes_cuota%rowtype;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede crear familias.' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(p_name), '') is null or nullif(pg_catalog.btrim(p_short_name), '') is null or p_joined_at is null then
    raise exception 'El nombre, el nombre corto y la fecha de alta son obligatorios.' using errcode = '22023';
  end if;
  if p_members is null or p_members < 1 or p_members > 50 then
    raise exception 'El número de miembros debe estar entre 1 y 50.' using errcode = '22023';
  end if;
  if p_annual_quota_cents is null or p_annual_quota_cents < 0 then
    raise exception 'La cuota anual debe expresarse en céntimos y no puede ser negativa.' using errcode = '22023';
  end if;

  insert into public.familias (name, short_name, members, joined_at, notes)
  values (pg_catalog.left(pg_catalog.btrim(p_name), 80), pg_catalog.left(pg_catalog.btrim(p_short_name), 30),
    p_members, p_joined_at, nullif(pg_catalog.btrim(p_notes), ''))
  returning * into v_family;

  select * into v_plan from public.planes_cuota where active order by year desc limit 1;
  if found then
    insert into public.cuotas (family_id, quota_plan_id, type, concept, period_start, period_end, amount_cents, due_date, status)
    select v_family.id, v_plan.id, 'MENSUAL', 'Cuota mensual',
      pg_catalog.make_date(v_plan.year, month_number, 1),
      (pg_catalog.make_date(v_plan.year, month_number, 1) + interval '1 month - 1 day')::date,
      v_plan.monthly_amount_cents,
      (pg_catalog.make_date(v_plan.year, month_number, 1) + interval '1 month - 1 day')::date,
      case when v_plan.monthly_amount_cents = 0 then 'PAGADA' else 'PENDIENTE' end
    from pg_catalog.generate_series(1, 12) month_number;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_family.id::text, 'name', v_family.name, 'shortName', v_family.short_name,
    'members', v_family.members, 'active', v_family.active, 'joinedAt', v_family.joined_at,
    'quotaCents', coalesce(v_plan.annual_amount_cents, p_annual_quota_cents),
    'contributedCents', 0, 'notes', coalesce(v_family.notes, '')
  );
end;
$$;

create or replace function public.create_contribution(
  p_family_id uuid, p_received_at date, p_amount_cents integer, p_concept text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_row public.aportaciones%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede registrar aportaciones.' using errcode = '42501'; end if;
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

create or replace function public.set_quota_plan(p_year integer, p_monthly_amount_cents integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_plan public.planes_cuota%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede configurar cuotas.' using errcode = '42501'; end if;
  if p_year < 2020 or p_year > 2100 or p_monthly_amount_cents < 0 then
    raise exception 'El año o la cuota mensual no son válidos.' using errcode = '22023';
  end if;
  update public.planes_cuota set active = false where active;
  insert into public.planes_cuota (year, monthly_amount_cents, annual_amount_cents, active)
  values (p_year, p_monthly_amount_cents, p_monthly_amount_cents * 12, true)
  on conflict (year) do update set monthly_amount_cents = excluded.monthly_amount_cents,
    annual_amount_cents = excluded.annual_amount_cents, active = true
  returning * into v_plan;

  insert into public.cuotas (family_id, quota_plan_id, type, concept, period_start, period_end, amount_cents, due_date, status)
  select family.id, v_plan.id, 'MENSUAL', 'Cuota mensual',
    pg_catalog.make_date(p_year, month_number, 1),
    (pg_catalog.make_date(p_year, month_number, 1) + interval '1 month - 1 day')::date,
    p_monthly_amount_cents,
    (pg_catalog.make_date(p_year, month_number, 1) + interval '1 month - 1 day')::date,
    case when p_monthly_amount_cents = 0 then 'PAGADA' else 'PENDIENTE' end
  from public.familias family cross join pg_catalog.generate_series(1, 12) month_number
  where family.active
  on conflict (family_id, quota_plan_id, period_start) where quota_plan_id is not null
  do update set amount_cents = excluded.amount_cents, period_end = excluded.period_end, due_date = excluded.due_date,
    status = case when excluded.amount_cents = 0 then 'PAGADA' else public.cuotas.status end;

  return pg_catalog.jsonb_build_object('id', v_plan.id::text, 'year', v_plan.year,
    'monthlyAmountCents', v_plan.monthly_amount_cents, 'annualAmountCents', v_plan.annual_amount_cents,
    'dueThroughMonth', case when v_plan.year = extract(year from current_date)::integer
      then extract(month from current_date)::integer when v_plan.year < extract(year from current_date)::integer then 12 else 1 end,
    'active', v_plan.active);
end;
$$;

create or replace function public.create_expense(
  p_spent_at date, p_concept text, p_amount_cents integer, p_category_name text,
  p_provider text default null, p_notes text default null,
  p_payment_source text default 'COMMUNITY', p_payers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_expense public.gastos%rowtype;
  v_item jsonb;
  v_allocated bigint := 0;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede registrar gastos.' using errcode = '42501'; end if;
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
security invoker
set search_path = ''
as $$
declare v_assessment public.derramas%rowtype; v_item jsonb; v_allocated bigint := 0;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede crear derramas.' using errcode = '42501'; end if;
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
security invoker
set search_path = ''
as $$
declare v_meter public.contadores%rowtype; v_previous public.lecturas_agua%rowtype; v_reading public.lecturas_agua%rowtype; v_price integer;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede registrar lecturas en esta fase.' using errcode = '42501'; end if;
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

create or replace function public.create_water_settlement(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tariff public.tarifas_agua%rowtype; v_batch public.lotes_liquidacion_agua%rowtype;
  v_family public.familias%rowtype; v_meter public.contadores%rowtype;
  v_current public.lecturas_agua%rowtype; v_previous public.lecturas_agua%rowtype;
  v_usage numeric(12,3); v_amount integer; v_total_usage numeric(12,3) := 0;
  v_total_amount integer := 0; v_items jsonb := '[]'::jsonb;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede liquidar el agua.' using errcode = '42501'; end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'El periodo de liquidación no es válido.' using errcode = '22023';
  end if;
  select * into v_tariff from public.tarifas_agua where active and valid_from <= p_period_end
    and (valid_until is null or valid_until >= p_period_end) order by valid_from desc limit 1;
  if not found then raise exception 'No hay una tarifa de agua válida para la liquidación.' using errcode = '22023'; end if;
  insert into public.lotes_liquidacion_agua (period_start, period_end, tariff_id, total_consumption_m3, total_amount_cents, status, created_by)
  values (p_period_start, p_period_end, v_tariff.id, 0, 0, 'EMITIDA', (select auth.uid())) returning * into v_batch;

  for v_family in select * from public.familias where active order by name loop
    select * into v_meter from public.contadores where family_id = v_family.id and active limit 1;
    if not found then raise exception 'Falta un contador activo para %.', v_family.name using errcode = '22023'; end if;
    select * into v_current from public.lecturas_agua where meter_id = v_meter.id and read_at <= p_period_end
      order by read_at desc, created_at desc limit 1;
    if not found then raise exception 'Falta la lectura actual de %.', v_family.name using errcode = '22023'; end if;
    select reading.* into v_previous
    from public.liquidaciones_agua settlement
    join public.lotes_liquidacion_agua batch on batch.id = settlement.settlement_batch_id
    join public.lecturas_agua reading on reading.id = settlement.current_reading_id
    where settlement.family_id = v_family.id and batch.status = 'EMITIDA' and batch.period_end <= p_period_start
    order by batch.period_end desc limit 1;
    if not found then
      select * into v_previous from public.lecturas_agua where meter_id = v_meter.id and read_at < v_current.read_at
        order by read_at desc, created_at desc limit 1;
    end if;
    if not found then raise exception 'Falta una lectura anterior para %.', v_family.name using errcode = '22023'; end if;
    if v_current.reading_m3 < v_previous.reading_m3 then raise exception 'La lectura de % es menor que la anterior.', v_family.name using errcode = '22023'; end if;
    v_usage := pg_catalog.round(v_current.reading_m3 - v_previous.reading_m3, 3);
    v_amount := pg_catalog.round(v_usage * v_tariff.price_cents_m3)::integer;
    insert into public.liquidaciones_agua (family_id, meter_id, previous_reading_id, current_reading_id,
      consumption_m3, tariff_id, applied_price_cents_m3, amount_cents, status, settlement_batch_id)
    values (v_family.id, v_meter.id, v_previous.id, v_current.id, v_usage, v_tariff.id,
      v_tariff.price_cents_m3, v_amount, 'PENDIENTE', v_batch.id);
    v_total_usage := v_total_usage + v_usage; v_total_amount := v_total_amount + v_amount;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'familyId', v_family.id::text, 'meterId', v_meter.id::text, 'readingId', v_current.id::text,
      'previousReadingM3', v_previous.reading_m3, 'currentReadingM3', v_current.reading_m3,
      'readingDate', v_current.read_at, 'usageM3', v_usage,
      'priceCentsPerM3', v_tariff.price_cents_m3, 'amountCents', v_amount));
  end loop;
  update public.lotes_liquidacion_agua set total_consumption_m3 = v_total_usage, total_amount_cents = v_total_amount where id = v_batch.id;
  return pg_catalog.jsonb_build_object('id', v_batch.id::text, 'periodStart', p_period_start,
    'periodEnd', p_period_end, 'status', 'EMITIDA', 'totalUsageM3', v_total_usage,
    'totalAmountCents', v_total_amount, 'items', v_items);
end;
$$;

create or replace function public.get_community_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_year_start date := pg_catalog.date_trunc('year', current_date)::date; v_result jsonb;
begin
  if not (select public.current_user_is_active()) then raise exception 'La sesión no tiene acceso activo.' using errcode = '42501'; end if;
  with readings_with_previous as (
    select reading.*, pg_catalog.lag(reading.reading_m3) over (partition by reading.meter_id order by reading.read_at, reading.created_at) previous_m3
    from public.lecturas_agua reading
  ), latest_readings as (
    select distinct on (meter_id) * from readings_with_previous order by meter_id, read_at desc, created_at desc
  )
  select pg_catalog.jsonb_build_object(
    'viewer', (select pg_catalog.jsonb_build_object('displayName', display_name, 'role', role, 'familyId', family_id::text)
      from public.usuarios where id = (select auth.uid()) and active),
    'community', pg_catalog.jsonb_build_object(
      'name', coalesce((select value #>> '{}' from public.config where key = 'community_name'), 'Comunidad'),
      'currentBalanceCents', (select coalesce(pg_catalog.sum(amount_cents), 0) from public.aportaciones) -
        (select coalesce(pg_catalog.sum(amount_cents), 0) from public.gastos where payment_source = 'COMMUNITY'),
      'yearlyIncomeCents', (select coalesce(pg_catalog.sum(amount_cents), 0) from public.aportaciones where received_at >= v_year_start),
      'yearlyExpensesCents', (select coalesce(pg_catalog.sum(amount_cents), 0) from public.gastos where spent_at >= v_year_start),
      'waterPriceCentsPerM3', coalesce((select price_cents_m3 from public.tarifas_agua where active order by valid_from desc limit 1), 0),
      'activeFamilyCount', (select pg_catalog.count(*) from public.familias where active),
      'upToDateFamilyCount', (select pg_catalog.count(*) from public.familias family where family.active and
        coalesce((select pg_catalog.sum(amount_cents) from public.aportaciones where family_id = family.id and received_at >= v_year_start), 0) >=
        coalesce((select monthly_amount_cents * extract(month from current_date)::integer from public.planes_cuota where active and year = extract(year from current_date)::integer limit 1), 0)),
      'latestWaterUsageM3', (select coalesce(pg_catalog.sum(greatest(reading_m3 - coalesce(previous_m3, meter.initial_reading_m3), 0)), 0)
        from latest_readings join public.contadores meter on meter.id = latest_readings.meter_id),
      'nextMeeting', pg_catalog.jsonb_build_object('day', '—', 'month', 'Sin fecha', 'time', '', 'place', 'Por concretar')
    ),
    'quotaPlans', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id::text, 'year', year,
      'monthlyAmountCents', monthly_amount_cents, 'annualAmountCents', annual_amount_cents,
      'dueThroughMonth', case when year = extract(year from current_date)::integer then extract(month from current_date)::integer when year < extract(year from current_date)::integer then 12 else 1 end,
      'active', active) order by year desc), '[]'::jsonb) from public.planes_cuota),
    'families', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', family.id::text,
      'name', family.name, 'shortName', family.short_name, 'members', family.members, 'active', family.active,
      'joinedAt', family.joined_at, 'quotaCents', coalesce((select annual_amount_cents from public.planes_cuota where active order by year desc limit 1), 0),
      'contributedCents', coalesce((select pg_catalog.sum(amount_cents) from public.aportaciones where family_id = family.id and received_at >= v_year_start), 0),
      'notes', coalesce(family.notes, '')) order by family.name), '[]'::jsonb) from public.familias family where family.active),
    'contributions', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id::text, 'familyId', family_id::text,
      'date', received_at, 'amountCents', amount_cents, 'concept', concept) order by received_at desc), '[]'::jsonb) from public.aportaciones),
    'expenses', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', expense.id::text, 'date', expense.spent_at,
      'concept', expense.concept, 'amountCents', expense.amount_cents, 'category', category.name,
      'provider', coalesce(expense.provider, 'Sin proveedor'), 'paymentSource', expense.payment_source,
      'payers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', family_id::text, 'amountCents', amount_cents)) from public.gasto_pagadores where expense_id = expense.id), '[]'::jsonb),
      'notes', coalesce(expense.notes, '')) order by expense.spent_at desc), '[]'::jsonb)
      from public.gastos expense join public.categorias category on category.id = expense.category_id),
    'assessments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', assessment.id::text,
      'date', assessment.assessed_at, 'concept', assessment.concept, 'totalAmountCents', assessment.total_amount_cents,
      'status', assessment.status, 'allocations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', family_id::text, 'amountCents', amount_cents)) from public.derrama_familias where assessment_id = assessment.id), '[]'::jsonb),
      'notes', coalesce(assessment.notes, '')) order by assessment.assessed_at desc), '[]'::jsonb) from public.derramas assessment where status <> 'ANULADA'),
    'expenseCategories', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', category.name,
      'amountCents', coalesce((select pg_catalog.sum(amount_cents) from public.gastos where category_id = category.id and spent_at >= v_year_start), 0),
      'color', coalesce(category.color, '#748078')) order by category.display_order, category.name), '[]'::jsonb)
      from public.categorias category where category.type = 'GASTO' and category.active),
    'monthlyExpensesCents', (select pg_catalog.jsonb_agg(coalesce((select pg_catalog.sum(amount_cents) from public.gastos where spent_at >= month_start::date and spent_at < (month_start + interval '1 month')::date), 0) order by month_start)
      from pg_catalog.generate_series(pg_catalog.date_trunc('month', current_date) - interval '8 months', pg_catalog.date_trunc('month', current_date), interval '1 month') month_start),
    'waterReadings', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', reading.id::text,
      'familyId', reading.family_id::text, 'meterId', reading.meter_id::text, 'date', reading.read_at,
      'readingM3', reading.reading_m3, 'previousReadingM3', coalesce(reading.previous_m3, meter.initial_reading_m3),
      'appliedPriceCents', coalesce((select price_cents_m3 from public.tarifas_agua where valid_from <= reading.read_at and (valid_until is null or valid_until >= reading.read_at) order by valid_from desc limit 1), 0)) order by reading.read_at desc), '[]'::jsonb)
      from readings_with_previous reading join public.contadores meter on meter.id = reading.meter_id),
    'waterSettlements', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', batch.id::text,
      'periodStart', batch.period_start, 'periodEnd', batch.period_end, 'status', batch.status,
      'totalUsageM3', batch.total_consumption_m3, 'totalAmountCents', batch.total_amount_cents,
      'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', settlement.family_id::text,
        'meterId', settlement.meter_id::text, 'currentReadingM3', current_reading.reading_m3, 'usageM3', settlement.consumption_m3,
        'amountCents', settlement.amount_cents)) from public.liquidaciones_agua settlement join public.lecturas_agua current_reading on current_reading.id = settlement.current_reading_id where settlement.settlement_batch_id = batch.id), '[]'::jsonb)) order by batch.period_end), '[]'::jsonb)
      from public.lotes_liquidacion_agua batch where status = 'EMITIDA'),
    'lastWaterSettlement', coalesce((select pg_catalog.jsonb_build_object('id', batch.id::text, 'date', batch.period_end,
      'settledReadings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', settlement.family_id::text,
        'meterId', settlement.meter_id::text, 'readingM3', reading.reading_m3)) from public.liquidaciones_agua settlement
        join public.lecturas_agua reading on reading.id = settlement.current_reading_id where settlement.settlement_batch_id = batch.id), '[]'::jsonb))
      from public.lotes_liquidacion_agua batch where status = 'EMITIDA' order by period_end desc limit 1),
      pg_catalog.jsonb_build_object('id', null, 'date', null, 'settledReadings', '[]'::jsonb))
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_community_snapshot() from public, anon;
revoke all on function public.create_family(text, text, integer, date, integer, text) from public, anon;
revoke all on function public.create_contribution(uuid, date, integer, text) from public, anon;
revoke all on function public.set_quota_plan(integer, integer) from public, anon;
revoke all on function public.create_expense(date, text, integer, text, text, text, text, jsonb) from public, anon;
revoke all on function public.create_assessment(text, date, integer, jsonb, text) from public, anon;
revoke all on function public.create_water_reading(uuid, uuid, date, numeric, text) from public, anon;
revoke all on function public.create_water_settlement(date, date) from public, anon;
grant execute on function public.get_community_snapshot() to authenticated;
grant execute on function public.create_family(text, text, integer, date, integer, text) to authenticated;
grant execute on function public.create_contribution(uuid, date, integer, text) to authenticated;
grant execute on function public.set_quota_plan(integer, integer) to authenticated;
grant execute on function public.create_expense(date, text, integer, text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_assessment(text, date, integer, jsonb, text) to authenticated;
grant execute on function public.create_water_reading(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.create_water_settlement(date, date) to authenticated;
