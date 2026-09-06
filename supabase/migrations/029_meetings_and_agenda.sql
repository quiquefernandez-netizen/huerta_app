-- Fase 3: reuniones y orden del día.

create table if not exists public.reuniones (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  start_time time not null,
  place text not null,
  status text not null default 'PLANIFICADA' check (status in ('PLANIFICADA', 'CELEBRADA', 'CANCELADA')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_catalog.length(pg_catalog.btrim(place)) between 2 and 160)
);

create table if not exists public.orden_dia (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.reuniones(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  description text,
  proposal_id uuid references public.propuestas(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orden_dia_meeting_position_key unique (meeting_id, position) deferrable initially deferred,
  check (pg_catalog.length(pg_catalog.btrim(title)) between 3 and 180)
);

create index if not exists reuniones_date_idx on public.reuniones (meeting_date desc, start_time desc);
create index if not exists orden_dia_meeting_idx on public.orden_dia (meeting_id, position);

alter table public.reuniones enable row level security;
alter table public.orden_dia enable row level security;
revoke all on table public.reuniones, public.orden_dia from anon, authenticated;

drop trigger if exists audit_reuniones_changes on public.reuniones;
create trigger audit_reuniones_changes after insert or update or delete on public.reuniones
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_orden_dia_changes on public.orden_dia;
create trigger audit_orden_dia_changes after insert or update or delete on public.orden_dia
for each row execute function public.audit_phase1_change();

create or replace function public.list_meetings()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para consultar reuniones.' using errcode = '42501'; end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', meeting.id::text,
    'date', meeting.meeting_date,
    'time', pg_catalog.to_char(meeting.start_time, 'HH24:MI'),
    'place', meeting.place,
    'status', meeting.status,
    'notes', coalesce(meeting.notes, ''),
    'agenda', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id::text,
      'position', item.position,
      'title', item.title,
      'description', coalesce(item.description, ''),
      'proposalId', item.proposal_id::text,
      'proposalTitle', proposal.title,
      'notes', coalesce(item.notes, '')
    ) order by item.position) from public.orden_dia item left join public.propuestas proposal on proposal.id = item.proposal_id where item.meeting_id = meeting.id), '[]'::jsonb)
  ) order by meeting.meeting_date desc, meeting.start_time desc) from public.reuniones meeting), '[]'::jsonb);
end;
$$;

create or replace function public.create_meeting(p_date date, p_time time, p_place text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_meeting public.reuniones%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede crear reuniones.' using errcode = '42501'; end if;
  if p_date is null or p_time is null or p_place is null or pg_catalog.length(pg_catalog.btrim(p_place)) not between 2 and 160 then raise exception 'Revisa la fecha, hora y lugar.' using errcode = '22023'; end if;
  insert into public.reuniones (meeting_date, start_time, place, notes, created_by)
  values (p_date, p_time, pg_catalog.btrim(p_place), nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid())) returning * into v_meeting;
  return pg_catalog.jsonb_build_object('id', v_meeting.id::text, 'date', v_meeting.meeting_date, 'time', pg_catalog.to_char(v_meeting.start_time, 'HH24:MI'), 'place', v_meeting.place, 'status', v_meeting.status, 'notes', coalesce(v_meeting.notes, ''), 'agenda', '[]'::jsonb);
end;
$$;

create or replace function public.update_meeting(p_id uuid, p_date date, p_time time, p_place text, p_status text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_meeting public.reuniones%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar reuniones.' using errcode = '42501'; end if;
  if p_date is null or p_time is null or p_place is null or pg_catalog.length(pg_catalog.btrim(p_place)) not between 2 and 160 or p_status not in ('PLANIFICADA', 'CELEBRADA', 'CANCELADA') then raise exception 'Revisa los datos de la reunión.' using errcode = '22023'; end if;
  update public.reuniones set meeting_date = p_date, start_time = p_time, place = pg_catalog.btrim(p_place), status = p_status, notes = nullif(pg_catalog.btrim(p_notes), ''), updated_at = pg_catalog.now()
  where id = p_id returning * into v_meeting;
  if not found then raise exception 'La reunión no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_meeting.id::text, 'date', v_meeting.meeting_date, 'time', pg_catalog.to_char(v_meeting.start_time, 'HH24:MI'), 'place', v_meeting.place, 'status', v_meeting.status, 'notes', coalesce(v_meeting.notes, ''));
end;
$$;

create or replace function public.delete_meeting(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar reuniones.' using errcode = '42501'; end if;
  delete from public.reuniones where id = p_id;
  if not found then raise exception 'La reunión no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

create or replace function public.create_agenda_item(p_meeting_id uuid, p_title text, p_description text default null, p_proposal_id uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.orden_dia%rowtype; v_position integer;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede preparar el orden del día.' using errcode = '42501'; end if;
  if not exists (select 1 from public.reuniones where id = p_meeting_id) then raise exception 'La reunión no existe.' using errcode = '22023'; end if;
  if p_proposal_id is not null and not exists (select 1 from public.propuestas where id = p_proposal_id) then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 3 and 180 then raise exception 'El título debe tener entre 3 y 180 caracteres.' using errcode = '22023'; end if;
  select coalesce(max(position), 0) + 1 into v_position from public.orden_dia where meeting_id = p_meeting_id;
  insert into public.orden_dia (meeting_id, position, title, description, proposal_id, notes, created_by)
  values (p_meeting_id, v_position, pg_catalog.btrim(p_title), nullif(pg_catalog.btrim(p_description), ''), p_proposal_id, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid())) returning * into v_item;
  return pg_catalog.jsonb_build_object('id', v_item.id::text, 'position', v_item.position, 'title', v_item.title, 'description', coalesce(v_item.description, ''), 'proposalId', v_item.proposal_id::text, 'notes', coalesce(v_item.notes, ''));
end;
$$;

create or replace function public.update_agenda_item(p_id uuid, p_title text, p_description text default null, p_proposal_id uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item public.orden_dia%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar el orden del día.' using errcode = '42501'; end if;
  if p_proposal_id is not null and not exists (select 1 from public.propuestas where id = p_proposal_id) then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 3 and 180 then raise exception 'Revisa el título del punto.' using errcode = '22023'; end if;
  update public.orden_dia set title = pg_catalog.btrim(p_title), description = nullif(pg_catalog.btrim(p_description), ''), proposal_id = p_proposal_id, notes = nullif(pg_catalog.btrim(p_notes), ''), updated_at = pg_catalog.now()
  where id = p_id returning * into v_item;
  if not found then raise exception 'El punto no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_item.id::text, 'position', v_item.position, 'title', v_item.title, 'description', coalesce(v_item.description, ''), 'proposalId', v_item.proposal_id::text, 'notes', coalesce(v_item.notes, ''));
end;
$$;

create or replace function public.delete_agenda_item(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_meeting_id uuid;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar puntos del orden del día.' using errcode = '42501'; end if;
  delete from public.orden_dia where id = p_id returning meeting_id into v_meeting_id;
  if not found then raise exception 'El punto no existe.' using errcode = '22023'; end if;
  with numbered as (select id, row_number() over (order by position)::integer new_position from public.orden_dia where meeting_id = v_meeting_id)
  update public.orden_dia item set position = numbered.new_position from numbered where item.id = numbered.id;
  return true;
end;
$$;

create or replace function public.reorder_agenda_items(p_meeting_id uuid, p_item_ids uuid[])
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_expected integer; v_distinct integer;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede reordenar el orden del día.' using errcode = '42501'; end if;
  select count(*) into v_expected from public.orden_dia where meeting_id = p_meeting_id;
  select count(distinct item_id) into v_distinct from unnest(p_item_ids) item_id;
  if coalesce(pg_catalog.array_length(p_item_ids, 1), 0) <> v_expected or v_distinct <> v_expected or exists (select 1 from unnest(p_item_ids) item_id where not exists (select 1 from public.orden_dia where id = item_id and meeting_id = p_meeting_id)) then
    raise exception 'El orden enviado no contiene exactamente todos los puntos.' using errcode = '22023';
  end if;
  update public.orden_dia item set position = ordered.position, updated_at = pg_catalog.now()
  from (select item_id, ordinality::integer position from unnest(p_item_ids) with ordinality values_ordered(item_id, ordinality)) ordered
  where item.id = ordered.item_id and item.meeting_id = p_meeting_id;
  return true;
end;
$$;

revoke all on function public.list_meetings() from public, anon;
revoke all on function public.create_meeting(date, time, text, text) from public, anon;
revoke all on function public.update_meeting(uuid, date, time, text, text, text) from public, anon;
revoke all on function public.delete_meeting(uuid) from public, anon;
revoke all on function public.create_agenda_item(uuid, text, text, uuid, text) from public, anon;
revoke all on function public.update_agenda_item(uuid, text, text, uuid, text) from public, anon;
revoke all on function public.delete_agenda_item(uuid) from public, anon;
revoke all on function public.reorder_agenda_items(uuid, uuid[]) from public, anon;
grant execute on function public.list_meetings() to authenticated;
grant execute on function public.create_meeting(date, time, text, text) to authenticated;
grant execute on function public.update_meeting(uuid, date, time, text, text, text) to authenticated;
grant execute on function public.delete_meeting(uuid) to authenticated;
grant execute on function public.create_agenda_item(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.update_agenda_item(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.delete_agenda_item(uuid) to authenticated;
grant execute on function public.reorder_agenda_items(uuid, uuid[]) to authenticated;
