-- Cualquier perfil activo puede corregir una lectura aún no liquidada. La
-- función protege la cadena acumulada del contador y jamás altera una lectura
-- que ya forme parte de una liquidación.

create or replace function public.update_water_reading(
  p_reading_id uuid, p_read_at date, p_reading_m3 numeric, p_observations text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reading public.lecturas_agua%rowtype;
  v_previous public.lecturas_agua%rowtype;
  v_next public.lecturas_agua%rowtype;
  v_meter public.contadores%rowtype;
begin
  if not (select public.current_user_is_active()) then
    raise exception 'Necesitas una sesión activa para corregir una lectura.' using errcode = '42501';
  end if;
  if p_reading_id is null or p_read_at is null or p_reading_m3 is null or p_reading_m3 < 0 then
    raise exception 'La fecha y una lectura válida son obligatorias.' using errcode = '22023';
  end if;
  select * into v_reading from public.lecturas_agua where id = p_reading_id;
  if not found then raise exception 'La lectura no existe.' using errcode = '22023'; end if;
  if exists (select 1 from public.liquidaciones_agua where previous_reading_id = p_reading_id or current_reading_id = p_reading_id) then
    raise exception 'No se puede corregir una lectura incluida en una liquidación.' using errcode = '22023';
  end if;
  select * into v_meter from public.contadores where id = v_reading.meter_id;
  select * into v_previous from public.lecturas_agua
    where meter_id = v_reading.meter_id and id <> p_reading_id and read_at < p_read_at
    order by read_at desc, created_at desc limit 1;
  select * into v_next from public.lecturas_agua
    where meter_id = v_reading.meter_id and id <> p_reading_id and read_at > p_read_at
    order by read_at, created_at limit 1;
  if found and p_reading_m3 > v_next.reading_m3 then
    raise exception 'La lectura no puede superar la siguiente lectura registrada.' using errcode = '22023';
  end if;
  if v_previous.id is not null and p_reading_m3 < v_previous.reading_m3 then
    raise exception 'La lectura no puede ser menor que la lectura anterior.' using errcode = '22023';
  end if;
  if v_previous.id is null and p_reading_m3 < v_meter.initial_reading_m3 then
    raise exception 'La lectura no puede ser menor que la lectura inicial del contador.' using errcode = '22023';
  end if;
  update public.lecturas_agua set read_at = p_read_at, reading_m3 = p_reading_m3,
    observations = nullif(pg_catalog.btrim(p_observations), '') where id = p_reading_id
  returning * into v_reading;
  return pg_catalog.jsonb_build_object('id', v_reading.id::text, 'familyId', v_reading.family_id::text,
    'meterId', v_reading.meter_id::text, 'date', v_reading.read_at, 'readingM3', v_reading.reading_m3,
    'observations', coalesce(v_reading.observations, ''));
end;
$$;

revoke all on function public.update_water_reading(uuid, date, numeric, text) from public, anon;
grant execute on function public.update_water_reading(uuid, date, numeric, text) to authenticated;
