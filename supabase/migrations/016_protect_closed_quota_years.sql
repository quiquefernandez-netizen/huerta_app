-- Un ejercicio cerrado es histórico: configurar un año nuevo nunca puede reescribirlo.
create or replace function public.set_quota_plan(p_year integer, p_monthly_amount_cents integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_plan public.planes_cuota%rowtype;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede configurar cuotas.' using errcode = '42501';
  end if;
  if p_year < extract(year from current_date)::integer then
    raise exception 'No se puede modificar una cuota de un ejercicio ya cerrado.' using errcode = '22023';
  end if;
  if p_year > 2100 or p_monthly_amount_cents < 0 then
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

revoke all on function public.set_quota_plan(integer, integer) from public, anon;
grant execute on function public.set_quota_plan(integer, integer) to authenticated;
