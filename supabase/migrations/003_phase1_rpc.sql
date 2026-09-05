-- Contratos base de Fase 1. La migración 007 los amplía y sustituye el snapshot
-- por el contrato definitivo del acceso Normal/Administrador.

create or replace function public.create_family(
  p_name text,
  p_short_name text,
  p_members integer,
  p_joined_at date,
  p_annual_quota_cents integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family public.familias%rowtype;
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
  if p_annual_quota_cents is null or p_annual_quota_cents <= 0 then
    raise exception 'La cuota anual debe ser un número entero de céntimos mayor que cero.' using errcode = '22023';
  end if;

  insert into public.familias (name, short_name, members, joined_at, notes)
  values (
    pg_catalog.left(pg_catalog.btrim(p_name), 80),
    pg_catalog.left(pg_catalog.btrim(p_short_name), 30),
    p_members,
    p_joined_at,
    nullif(pg_catalog.btrim(p_notes), '')
  )
  returning * into v_family;

  insert into public.cuotas (family_id, type, concept, period_start, period_end, amount_cents, due_date, status)
  values (
    v_family.id,
    'ANUAL',
    'Cuota anual',
    pg_catalog.date_trunc('year', current_date)::date,
    (pg_catalog.date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    p_annual_quota_cents,
    (pg_catalog.date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    'PENDIENTE'
  );

  return pg_catalog.jsonb_build_object(
    'id', v_family.id::text,
    'name', v_family.name,
    'shortName', v_family.short_name,
    'members', v_family.members,
    'active', v_family.active,
    'joinedAt', v_family.joined_at,
    'quotaCents', p_annual_quota_cents,
    'contributedCents', 0,
    'waterPendingCents', 0,
    'notes', coalesce(v_family.notes, '')
  );
end;
$$;

create or replace function public.create_expense(
  p_spent_at date,
  p_concept text,
  p_amount_cents integer,
  p_category_name text,
  p_provider text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_expense public.gastos%rowtype;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede registrar gastos.' using errcode = '42501';
  end if;
  if p_spent_at is null or nullif(pg_catalog.btrim(p_concept), '') is null then
    raise exception 'La fecha y el concepto son obligatorios.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe debe ser un número entero de céntimos mayor que cero.' using errcode = '22023';
  end if;

  select category.id into v_category_id
  from public.categorias category
  where category.name = p_category_name
    and category.type = 'GASTO'
    and category.active;

  if v_category_id is null then
    raise exception 'La categoría de gasto no existe o está desactivada.' using errcode = '22023';
  end if;

  insert into public.gastos (spent_at, concept, amount_cents, category_id, provider, notes, created_by)
  values (
    p_spent_at,
    pg_catalog.left(pg_catalog.btrim(p_concept), 80),
    p_amount_cents,
    v_category_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_provider), 80), ''),
    nullif(pg_catalog.btrim(p_notes), ''),
    (select auth.uid())
  )
  returning * into v_expense;

  return pg_catalog.jsonb_build_object(
    'id', v_expense.id::text,
    'date', v_expense.spent_at,
    'concept', v_expense.concept,
    'amountCents', v_expense.amount_cents,
    'category', p_category_name,
    'provider', coalesce(v_expense.provider, 'Sin proveedor'),
    'notes', coalesce(v_expense.notes, '')
  );
end;
$$;

create or replace function public.create_water_reading(
  p_family_id uuid,
  p_meter_id uuid,
  p_read_at date,
  p_reading_m3 numeric,
  p_observations text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meter public.contadores%rowtype;
  v_previous public.lecturas_agua%rowtype;
  v_reading public.lecturas_agua%rowtype;
  v_price_cents integer;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'La sesión no tiene acceso activo.' using errcode = '42501';
  end if;
  if p_read_at is null or p_reading_m3 is null or p_reading_m3 < 0 then
    raise exception 'La fecha y una lectura válida son obligatorias.' using errcode = '22023';
  end if;

  select meter.* into v_meter
  from public.contadores meter
  where meter.id = p_meter_id and meter.active;

  if not found or v_meter.family_id <> p_family_id then
    raise exception 'El contador no corresponde a la familia indicada.' using errcode = '22023';
  end if;
  if not (select public.current_user_is_admin())
    and p_family_id <> (select public.current_user_family_id()) then
    raise exception 'Solo puedes registrar lecturas de tu propio contador.' using errcode = '42501';
  end if;

  select reading.* into v_previous
  from public.lecturas_agua reading
  where reading.meter_id = p_meter_id
  order by reading.read_at desc, reading.created_at desc
  limit 1;

  if found and (p_read_at <= v_previous.read_at or p_reading_m3 < v_previous.reading_m3) then
    raise exception 'La lectura debe ser posterior y no puede ser menor que la anterior.' using errcode = '22023';
  end if;

  select tariff.price_cents_m3 into v_price_cents
  from public.tarifas_agua tariff
  where tariff.active
    and tariff.valid_from <= p_read_at
    and (tariff.valid_until is null or tariff.valid_until >= p_read_at)
  order by tariff.valid_from desc
  limit 1;

  if v_price_cents is null then
    raise exception 'No hay una tarifa de agua válida para esa fecha.' using errcode = '22023';
  end if;

  insert into public.lecturas_agua (family_id, meter_id, read_at, reading_m3, user_id, observations)
  values (p_family_id, p_meter_id, p_read_at, p_reading_m3, (select auth.uid()), nullif(pg_catalog.btrim(p_observations), ''))
  returning * into v_reading;

  return pg_catalog.jsonb_build_object(
    'id', v_reading.id::text,
    'familyId', v_reading.family_id::text,
    'meterId', v_reading.meter_id::text,
    'date', v_reading.read_at,
    'readingM3', v_reading.reading_m3,
    'previousReadingM3', coalesce(v_previous.reading_m3, v_meter.initial_reading_m3),
    'appliedPriceCents', v_price_cents,
    'observations', coalesce(v_reading.observations, '')
  );
end;
$$;

-- Versión intermedia necesaria para conservar el orden histórico de migraciones.
-- La versión definitiva, con lectura completa para ambos perfiles, está en 007.
create or replace function public.get_community_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := (select public.current_user_is_admin());
  v_family_id uuid := (select public.current_user_family_id());
  v_year_start date := pg_catalog.date_trunc('year', current_date)::date;
  v_result jsonb;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'La sesión no tiene acceso activo.' using errcode = '42501';
  end if;

  with
  general as (
    select
      (select coalesce(pg_catalog.sum(amount_cents), 0) from public.aportaciones) -
        (select coalesce(pg_catalog.sum(amount_cents), 0) from public.gastos) as balance_cents,
      (select coalesce(pg_catalog.sum(amount_cents), 0) from public.aportaciones where received_at >= v_year_start) as income_cents,
      (select coalesce(pg_catalog.sum(amount_cents), 0) from public.gastos where spent_at >= v_year_start) as expense_cents,
      (select pg_catalog.count(*) from public.familias where active) as active_family_count,
      (select price_cents_m3 from public.tarifas_agua where active order by valid_from desc limit 1) as water_price_cents
  ),
  family_totals as (
    select family.id,
      coalesce((select pg_catalog.sum(fee.amount_cents) from public.cuotas fee where fee.family_id = family.id and fee.active and fee.period_end >= v_year_start), 0) as quota_cents,
      coalesce((select pg_catalog.sum(payment.amount_cents) from public.aportaciones payment where payment.family_id = family.id and payment.received_at >= v_year_start), 0) as contributed_cents
    from public.familias family
    where family.active
  ),
  latest_meter_readings as (
    select distinct on (reading.meter_id)
      reading.*,
      pg_catalog.lag(reading.reading_m3) over (partition by reading.meter_id order by reading.read_at, reading.created_at) as previous_m3
    from public.lecturas_agua reading
    order by reading.meter_id, reading.read_at desc, reading.created_at desc
  )
  select pg_catalog.jsonb_build_object(
    'viewer', (select pg_catalog.jsonb_build_object(
      'displayName', viewer.display_name,
      'role', viewer.role,
      'familyId', viewer.family_id::text
    ) from public.usuarios viewer where viewer.id = (select auth.uid()) and viewer.active),
    'community', pg_catalog.jsonb_build_object(
      'name', coalesce((select value #>> '{}' from public.config where key = 'community_name'), 'Comunidad'),
      'currentBalanceCents', general.balance_cents,
      'yearlyIncomeCents', general.income_cents,
      'yearlyExpensesCents', general.expense_cents,
      'waterPriceCentsPerM3', coalesce(general.water_price_cents, 0),
      'activeFamilyCount', general.active_family_count,
      'upToDateFamilyCount', (select pg_catalog.count(*) from family_totals where quota_cents > 0 and contributed_cents >= quota_cents),
      'latestWaterUsageM3', (select coalesce(pg_catalog.sum(greatest(reading.reading_m3 - coalesce(reading.previous_m3, meter.initial_reading_m3), 0)), 0) from latest_meter_readings reading join public.contadores meter on meter.id = reading.meter_id),
      'nextMeeting', pg_catalog.jsonb_build_object('day', '—', 'month', 'Sin fecha', 'time', '', 'place', 'Por concretar')
    ),
    'families', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', family.id::text, 'name', family.name, 'shortName', family.short_name,
      'members', family.members, 'active', family.active, 'joinedAt', family.joined_at,
      'quotaCents', totals.quota_cents, 'contributedCents', totals.contributed_cents,
      'waterPendingCents', coalesce((select pg_catalog.sum(bill.amount_cents) from public.liquidaciones_agua bill where bill.family_id = family.id and bill.status = 'PENDIENTE'), 0),
      'notes', coalesce(family.notes, '')
    ) order by family.name), '[]'::jsonb) from public.familias family join family_totals totals on totals.id = family.id where family.active and (v_is_admin or family.id = v_family_id)),
    'expenses', (select coalesce(pg_catalog.jsonb_agg(item.payload order by item.spent_at desc), '[]'::jsonb) from (
      select expense.spent_at, pg_catalog.jsonb_build_object('id', expense.id::text, 'date', expense.spent_at, 'concept', expense.concept, 'amountCents', expense.amount_cents, 'category', category.name, 'provider', coalesce(expense.provider, 'Sin proveedor'), 'notes', coalesce(expense.notes, '')) as payload
      from public.gastos expense join public.categorias category on category.id = expense.category_id order by expense.spent_at desc limit 50
    ) item),
    'expenseCategories', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', category.name, 'amountCents', coalesce(total.amount_cents, 0), 'color', coalesce(category.color, '#748078')) order by category.display_order, category.name), '[]'::jsonb)
      from public.categorias category left join lateral (select pg_catalog.sum(expense.amount_cents) as amount_cents from public.gastos expense where expense.category_id = category.id and expense.spent_at >= v_year_start) total on true where category.type = 'GASTO' and category.active),
    'monthlyExpensesCents', (select coalesce(pg_catalog.jsonb_agg(coalesce(total.amount_cents, 0) order by month.month_start), '[]'::jsonb)
      from pg_catalog.generate_series(pg_catalog.date_trunc('month', current_date) - interval '8 months', pg_catalog.date_trunc('month', current_date), interval '1 month') month(month_start)
      left join lateral (select pg_catalog.sum(expense.amount_cents) as amount_cents from public.gastos expense where expense.spent_at >= month.month_start::date and expense.spent_at < (month.month_start + interval '1 month')::date) total on true),
    'waterReadings', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', reading.id::text, 'familyId', reading.family_id::text, 'meterId', reading.meter_id::text,
      'date', reading.read_at, 'readingM3', reading.reading_m3,
      'previousReadingM3', coalesce(reading.previous_m3, meter.initial_reading_m3),
      'appliedPriceCents', coalesce((select tariff.price_cents_m3 from public.tarifas_agua tariff where tariff.valid_from <= reading.read_at and (tariff.valid_until is null or tariff.valid_until >= reading.read_at) order by tariff.valid_from desc limit 1), 0)
    ) order by reading.read_at desc), '[]'::jsonb) from latest_meter_readings reading join public.contadores meter on meter.id = reading.meter_id where v_is_admin or reading.family_id = v_family_id)
  ) into v_result
  from general;

  return v_result;
end;
$$;

revoke all on function public.get_community_snapshot() from public, anon;
revoke all on function public.create_family(text, text, integer, date, integer, text) from public, anon;
revoke all on function public.create_expense(date, text, integer, text, text, text) from public, anon;
revoke all on function public.create_water_reading(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.get_community_snapshot() to authenticated;
grant execute on function public.create_family(text, text, integer, date, integer, text) to authenticated;
grant execute on function public.create_expense(date, text, integer, text, text, text) to authenticated;
grant execute on function public.create_water_reading(uuid, uuid, date, numeric, text) to authenticated;
