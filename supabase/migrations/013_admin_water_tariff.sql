-- La tarifa se cambia creando una nueva vigencia desde hoy. Nunca se reescribe
-- una liquidación emitida: esta ya conserva applied_price_cents_m3.

alter function public.get_community_snapshot() rename to get_community_snapshot_base;

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
  return v_snapshot || pg_catalog.jsonb_build_object('waterTariffs', (
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', id::text, 'validFrom', valid_from, 'validUntil', valid_until,
      'priceCentsPerM3', price_cents_m3, 'active', active, 'notes', coalesce(notes, '')
    ) order by valid_from desc), '[]'::jsonb)
    from public.tarifas_agua
  ));
end;
$$;

create or replace function public.set_water_tariff(
  p_valid_from date, p_price_cents_m3 integer, p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_current public.tarifas_agua%rowtype; v_tariff public.tarifas_agua%rowtype;
begin
  if not (select public.current_user_is_admin()) then
    raise exception 'Solo administración puede configurar la tarifa de agua.' using errcode = '42501';
  end if;
  if p_valid_from is distinct from current_date or p_price_cents_m3 is null or p_price_cents_m3 < 0 then
    raise exception 'La tarifa debe tener un precio válido y comenzar hoy.' using errcode = '22023';
  end if;

  select * into v_current from public.tarifas_agua
    where active and valid_from <= p_valid_from and (valid_until is null or valid_until >= p_valid_from)
    order by valid_from desc limit 1;
  if not found then
    raise exception 'No existe una tarifa vigente que pueda sustituirse.' using errcode = '22023';
  end if;

  if v_current.valid_from = p_valid_from then
    if exists (select 1 from public.liquidaciones_agua where tariff_id = v_current.id) then
      raise exception 'La tarifa actual ya tiene liquidaciones emitidas y no puede cambiarse hoy.' using errcode = '22023';
    end if;
    update public.tarifas_agua set price_cents_m3 = p_price_cents_m3,
      notes = nullif(pg_catalog.btrim(p_notes), '') where id = v_current.id returning * into v_tariff;
  else
    update public.tarifas_agua set valid_until = p_valid_from - 1 where id = v_current.id;
    insert into public.tarifas_agua (valid_from, valid_until, price_cents_m3, active, notes)
    values (p_valid_from, null, p_price_cents_m3, true, nullif(pg_catalog.btrim(p_notes), ''))
    returning * into v_tariff;
  end if;
  return pg_catalog.jsonb_build_object('id', v_tariff.id::text, 'validFrom', v_tariff.valid_from,
    'validUntil', v_tariff.valid_until, 'priceCentsPerM3', v_tariff.price_cents_m3,
    'active', v_tariff.active, 'notes', coalesce(v_tariff.notes, ''));
end;
$$;

drop trigger if exists audit_tarifas_agua_changes on public.tarifas_agua;
create trigger audit_tarifas_agua_changes
after insert or update or delete on public.tarifas_agua
for each row execute function public.audit_phase1_change();

revoke all on function public.get_community_snapshot_base() from public, anon, authenticated;
revoke all on function public.get_community_snapshot() from public, anon;
revoke all on function public.set_water_tariff(date, integer, text) from public, anon;
grant execute on function public.get_community_snapshot() to authenticated;
grant execute on function public.set_water_tariff(date, integer, text) to authenticated;
