-- Una lectura nueva representa un avance del contador: no se admiten duplicados.
create or replace function public.create_water_reading(p_family_id uuid, p_meter_id uuid, p_read_at date, p_reading_m3 numeric, p_observations text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_meter public.contadores%rowtype; v_previous public.lecturas_agua%rowtype; v_reading public.lecturas_agua%rowtype; v_price integer;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para registrar una lectura.' using errcode = '42501'; end if;
  if p_read_at is null or p_reading_m3 is null or p_reading_m3 < 0 then raise exception 'La fecha y una lectura válida son obligatorias.' using errcode = '22023'; end if;
  select * into v_meter from public.contadores where id = p_meter_id and active;
  if not found or v_meter.family_id <> p_family_id then raise exception 'El contador no corresponde a la familia indicada.' using errcode = '22023'; end if;
  select * into v_previous from public.lecturas_agua where meter_id = p_meter_id order by read_at desc, created_at desc limit 1;
  if found and (p_read_at <= v_previous.read_at or p_reading_m3 <= v_previous.reading_m3) then raise exception 'La lectura debe ser posterior y mayor que la anterior.' using errcode = '22023'; end if;
  select price_cents_m3 into v_price from public.tarifas_agua where active and valid_from <= p_read_at and (valid_until is null or valid_until >= p_read_at) order by valid_from desc limit 1;
  if v_price is null then raise exception 'No hay una tarifa de agua válida para esa fecha.' using errcode = '22023'; end if;
  insert into public.lecturas_agua (family_id, meter_id, read_at, reading_m3, user_id, observations) values (p_family_id, p_meter_id, p_read_at, p_reading_m3, (select auth.uid()), nullif(pg_catalog.btrim(p_observations), '')) returning * into v_reading;
  return pg_catalog.jsonb_build_object('id', v_reading.id::text, 'familyId', v_reading.family_id::text, 'meterId', v_reading.meter_id::text, 'date', v_reading.read_at, 'readingM3', v_reading.reading_m3, 'previousReadingM3', coalesce(v_previous.reading_m3, v_meter.initial_reading_m3), 'appliedPriceCents', v_price, 'observations', coalesce(v_reading.observations, ''));
end; $$;
revoke all on function public.create_water_reading(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.create_water_reading(uuid, uuid, date, numeric, text) to authenticated;
