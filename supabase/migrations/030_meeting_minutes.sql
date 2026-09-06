-- Fase 3: actas estructuradas por reunión y punto del orden del día.

create table if not exists public.actas (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.reuniones(id) on delete cascade,
  minutes_date date not null,
  content text,
  status text not null default 'BORRADOR' check (status in ('BORRADOR', 'REVISADA', 'CERRADA')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'CERRADA' and closed_at is not null) or (status <> 'CERRADA' and closed_at is null))
);

create table if not exists public.acta_asistentes (
  id uuid primary key default gen_random_uuid(),
  minutes_id uuid not null references public.actas(id) on delete cascade,
  family_id uuid not null references public.familias(id),
  unique (minutes_id, family_id)
);

create table if not exists public.acta_puntos (
  id uuid primary key default gen_random_uuid(),
  minutes_id uuid not null references public.actas(id) on delete cascade,
  agenda_item_id uuid references public.orden_dia(id) on delete set null,
  position integer not null check (position > 0),
  subject text not null,
  summary text,
  decision text,
  voting_result_json jsonb,
  observations text,
  updated_at timestamptz not null default now(),
  unique (minutes_id, position)
);

create index if not exists acta_puntos_minutes_idx on public.acta_puntos (minutes_id, position);

alter table public.actas enable row level security;
alter table public.acta_asistentes enable row level security;
alter table public.acta_puntos enable row level security;
revoke all on table public.actas, public.acta_asistentes, public.acta_puntos from anon, authenticated;

drop trigger if exists audit_actas_changes on public.actas;
create trigger audit_actas_changes after insert or update or delete on public.actas for each row execute function public.audit_phase1_change();
drop trigger if exists audit_acta_asistentes_changes on public.acta_asistentes;
create trigger audit_acta_asistentes_changes after insert or update or delete on public.acta_asistentes for each row execute function public.audit_phase1_change();
drop trigger if exists audit_acta_puntos_changes on public.acta_puntos;
create trigger audit_acta_puntos_changes after insert or update or delete on public.acta_puntos for each row execute function public.audit_phase1_change();

create or replace function public.list_meeting_minutes()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para consultar actas.' using errcode = '42501'; end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', minutes.id::text,
    'meetingId', minutes.meeting_id::text,
    'date', minutes.minutes_date,
    'content', coalesce(minutes.content, ''),
    'status', minutes.status,
    'closedAt', minutes.closed_at,
    'attendees', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('familyId', family.id::text, 'familyName', family.name) order by family.name) from public.acta_asistentes attendee join public.familias family on family.id = attendee.family_id where attendee.minutes_id = minutes.id), '[]'::jsonb),
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id::text, 'agendaItemId', item.agenda_item_id::text, 'position', item.position,
      'subject', item.subject, 'summary', coalesce(item.summary, ''), 'decision', coalesce(item.decision, ''),
      'votingResult', item.voting_result_json, 'observations', coalesce(item.observations, '')
    ) order by item.position) from public.acta_puntos item where item.minutes_id = minutes.id), '[]'::jsonb)
  ) order by minutes.minutes_date desc, minutes.created_at desc) from public.actas minutes), '[]'::jsonb);
end;
$$;

create or replace function public.create_meeting_minutes(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_minutes public.actas%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede crear actas.' using errcode = '42501'; end if;
  insert into public.actas (meeting_id, minutes_date, created_by)
  select id, meeting_date, (select auth.uid()) from public.reuniones where id = p_meeting_id
  returning * into v_minutes;
  if not found then raise exception 'La reunión no existe o ya tiene acta.' using errcode = '22023'; end if;

  insert into public.acta_puntos (minutes_id, agenda_item_id, position, subject, voting_result_json)
  select v_minutes.id, agenda.id, agenda.position, agenda.title,
    case when agenda.proposal_id is null then null else (
      select pg_catalog.jsonb_build_object(
        'favor', count(*) filter (where vote.vote = 'FAVOR'),
        'contra', count(*) filter (where vote.vote = 'CONTRA'),
        'abstencion', count(*) filter (where vote.vote = 'ABSTENCION')
      ) from public.votaciones voting left join public.votos vote on vote.voting_id = voting.id where voting.proposal_id = agenda.proposal_id
    ) end
  from public.orden_dia agenda where agenda.meeting_id = p_meeting_id order by agenda.position;
  return pg_catalog.jsonb_build_object('id', v_minutes.id::text, 'meetingId', v_minutes.meeting_id::text, 'date', v_minutes.minutes_date, 'status', v_minutes.status);
exception when unique_violation then
  raise exception 'La reunión ya tiene un acta.' using errcode = '22023';
end;
$$;

create or replace function public.update_meeting_minutes(p_id uuid, p_attendee_family_ids uuid[], p_content text default null, p_status text default 'BORRADOR')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_distinct integer;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar actas.' using errcode = '42501'; end if;
  if p_status not in ('BORRADOR', 'REVISADA') then raise exception 'Para cerrar el acta usa la acción de cierre.' using errcode = '22023'; end if;
  if exists (select 1 from public.actas where id = p_id and status = 'CERRADA') then raise exception 'El acta está cerrada y no se puede modificar.' using errcode = '22023'; end if;
  select count(*), count(distinct family_id) into v_count, v_distinct from unnest(coalesce(p_attendee_family_ids, '{}'::uuid[])) family_id;
  if v_count <> v_distinct or exists (select 1 from unnest(coalesce(p_attendee_family_ids, '{}'::uuid[])) family_id where not exists (select 1 from public.familias where id = family_id and active)) then raise exception 'Revisa las familias asistentes.' using errcode = '22023'; end if;
  update public.actas set content = nullif(pg_catalog.btrim(p_content), ''), status = p_status, updated_at = pg_catalog.now() where id = p_id;
  if not found then raise exception 'El acta no existe.' using errcode = '22023'; end if;
  delete from public.acta_asistentes where minutes_id = p_id;
  insert into public.acta_asistentes (minutes_id, family_id) select p_id, family_id from unnest(coalesce(p_attendee_family_ids, '{}'::uuid[])) family_id;
  return true;
end;
$$;

create or replace function public.update_minutes_item(p_id uuid, p_summary text, p_decision text, p_observations text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar actas.' using errcode = '42501'; end if;
  if exists (select 1 from public.acta_puntos item join public.actas minutes on minutes.id = item.minutes_id where item.id = p_id and minutes.status = 'CERRADA') then raise exception 'El acta está cerrada y no se puede modificar.' using errcode = '22023'; end if;
  update public.acta_puntos set summary = nullif(pg_catalog.btrim(p_summary), ''), decision = nullif(pg_catalog.btrim(p_decision), ''), observations = nullif(pg_catalog.btrim(p_observations), ''), updated_at = pg_catalog.now() where id = p_id;
  if not found then raise exception 'El punto del acta no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

create or replace function public.close_meeting_minutes(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_meeting_id uuid;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede cerrar actas.' using errcode = '42501'; end if;
  if not exists (select 1 from public.acta_asistentes where minutes_id = p_id) then raise exception 'Añade al menos una familia asistente antes de cerrar.' using errcode = '22023'; end if;
  if exists (select 1 from public.acta_puntos where minutes_id = p_id and (summary is null or decision is null)) then raise exception 'Completa el resumen y la decisión de todos los puntos.' using errcode = '22023'; end if;
  update public.actas set status = 'CERRADA', closed_at = pg_catalog.now(), closed_by = (select auth.uid()), updated_at = pg_catalog.now()
  where id = p_id and status <> 'CERRADA' returning meeting_id into v_meeting_id;
  if not found then raise exception 'El acta no existe o ya está cerrada.' using errcode = '22023'; end if;
  update public.reuniones set status = 'CELEBRADA', updated_at = pg_catalog.now() where id = v_meeting_id;
  return true;
end;
$$;

create or replace function public.protect_closed_minutes_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meeting_id uuid;
begin
  v_meeting_id := case when TG_OP = 'DELETE' then old.meeting_id else new.meeting_id end;
  if exists (select 1 from public.actas where meeting_id = v_meeting_id and status = 'CERRADA') then
    raise exception 'El acta está cerrada y su orden del día no se puede modificar.' using errcode = '22023';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_closed_minutes_agenda_changes on public.orden_dia;
create trigger protect_closed_minutes_agenda_changes before insert or update or delete on public.orden_dia
for each row execute function public.protect_closed_minutes_agenda();

revoke all on function public.protect_closed_minutes_agenda() from public, anon, authenticated;

create or replace function public.update_meeting(p_id uuid, p_date date, p_time time, p_place text, p_status text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_meeting public.reuniones%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar reuniones.' using errcode = '42501'; end if;
  if exists (select 1 from public.actas where meeting_id = p_id and status = 'CERRADA') then raise exception 'La reunión tiene el acta cerrada y no se puede modificar.' using errcode = '22023'; end if;
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
  if exists (select 1 from public.actas where meeting_id = p_id and status = 'CERRADA') then raise exception 'No se puede eliminar una reunión con el acta cerrada.' using errcode = '22023'; end if;
  delete from public.reuniones where id = p_id;
  if not found then raise exception 'La reunión no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

revoke all on function public.list_meeting_minutes() from public, anon;
revoke all on function public.create_meeting_minutes(uuid) from public, anon;
revoke all on function public.update_meeting_minutes(uuid, uuid[], text, text) from public, anon;
revoke all on function public.update_minutes_item(uuid, text, text, text) from public, anon;
revoke all on function public.close_meeting_minutes(uuid) from public, anon;
grant execute on function public.list_meeting_minutes() to authenticated;
grant execute on function public.create_meeting_minutes(uuid) to authenticated;
grant execute on function public.update_meeting_minutes(uuid, uuid[], text, text) to authenticated;
grant execute on function public.update_minutes_item(uuid, text, text, text) to authenticated;
grant execute on function public.close_meeting_minutes(uuid) to authenticated;
