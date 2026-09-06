-- Fase 3: catálogo documental. Los binarios no se guardan en PostgreSQL;
-- cada fila conserva únicamente un enlace HTTPS y su relación comunitaria.

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text not null check (document_type in ('FACTURA', 'PRESUPUESTO', 'ACTA', 'RECIBO', 'CONTRATO', 'OTRO')),
  document_date date not null,
  url text not null,
  entity_type text not null default 'GENERAL' check (entity_type in ('GENERAL', 'GASTO', 'PROPUESTA', 'REUNION', 'ACTA')),
  entity_id uuid,
  visibility text not null default 'COMUNIDAD' check (visibility in ('COMUNIDAD', 'ADMINISTRACION')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity_type = 'GENERAL' and entity_id is null) or (entity_type <> 'GENERAL' and entity_id is not null)),
  check (pg_catalog.length(pg_catalog.btrim(name)) between 2 and 180),
  check (pg_catalog.length(url) between 9 and 2000 and url ~ '^https://[^[:space:]]+$')
);

create index if not exists documentos_date_idx on public.documentos (document_date desc, created_at desc);
create index if not exists documentos_entity_idx on public.documentos (entity_type, entity_id);

alter table public.documentos enable row level security;
revoke all on table public.documentos from anon, authenticated;

drop trigger if exists audit_documentos_changes on public.documentos;
create trigger audit_documentos_changes after insert or update or delete on public.documentos
for each row execute function public.audit_phase1_change();

create or replace function public.document_relation_exists(p_entity_type text, p_entity_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_entity_type
    when 'GENERAL' then p_entity_id is null
    when 'GASTO' then exists (select 1 from public.gastos where id = p_entity_id)
    when 'PROPUESTA' then exists (select 1 from public.propuestas where id = p_entity_id)
    when 'REUNION' then exists (select 1 from public.reuniones where id = p_entity_id)
    when 'ACTA' then exists (select 1 from public.actas where id = p_entity_id)
    else false
  end;
$$;

revoke all on function public.document_relation_exists(text, uuid) from public, anon, authenticated;

create or replace function public.list_documents()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_active()) then
    raise exception 'Necesitas una sesión activa para consultar documentos.' using errcode = '42501';
  end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', document.id::text,
    'name', document.name,
    'type', document.document_type,
    'date', document.document_date,
    'url', document.url,
    'entityType', document.entity_type,
    'entityId', document.entity_id::text,
    'visibility', document.visibility,
    'notes', coalesce(document.notes, '')
  ) order by document.document_date desc, document.created_at desc)
  from public.documentos document
  where document.visibility = 'COMUNIDAD' or (select public.current_user_is_admin())), '[]'::jsonb);
end;
$$;

create or replace function public.create_document(
  p_name text, p_type text, p_date date, p_url text,
  p_entity_type text default 'GENERAL', p_entity_id uuid default null,
  p_visibility text default 'COMUNIDAD', p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_document public.documentos%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede añadir documentos.' using errcode = '42501'; end if;
  if p_name is null or pg_catalog.length(pg_catalog.btrim(p_name)) not between 2 and 180 or p_type is null or p_type not in ('FACTURA', 'PRESUPUESTO', 'ACTA', 'RECIBO', 'CONTRATO', 'OTRO') or p_date is null or p_url is null or pg_catalog.length(p_url) not between 9 and 2000 or p_url !~ '^https://[^[:space:]]+$' or p_visibility is null or p_visibility not in ('COMUNIDAD', 'ADMINISTRACION') or p_entity_type is null or not coalesce((select public.document_relation_exists(p_entity_type, p_entity_id)), false) then
    raise exception 'Revisa los datos y la relación del documento.' using errcode = '22023';
  end if;
  insert into public.documentos (name, document_type, document_date, url, entity_type, entity_id, visibility, notes, created_by)
  values (pg_catalog.btrim(p_name), p_type, p_date, p_url, p_entity_type, p_entity_id, p_visibility, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid()))
  returning * into v_document;
  return pg_catalog.jsonb_build_object('id', v_document.id::text, 'name', v_document.name, 'type', v_document.document_type, 'date', v_document.document_date, 'url', v_document.url, 'entityType', v_document.entity_type, 'entityId', v_document.entity_id::text, 'visibility', v_document.visibility, 'notes', coalesce(v_document.notes, ''));
end;
$$;

create or replace function public.update_document(
  p_id uuid, p_name text, p_type text, p_date date, p_url text,
  p_entity_type text default 'GENERAL', p_entity_id uuid default null,
  p_visibility text default 'COMUNIDAD', p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_document public.documentos%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar documentos.' using errcode = '42501'; end if;
  if p_name is null or pg_catalog.length(pg_catalog.btrim(p_name)) not between 2 and 180 or p_type is null or p_type not in ('FACTURA', 'PRESUPUESTO', 'ACTA', 'RECIBO', 'CONTRATO', 'OTRO') or p_date is null or p_url is null or pg_catalog.length(p_url) not between 9 and 2000 or p_url !~ '^https://[^[:space:]]+$' or p_visibility is null or p_visibility not in ('COMUNIDAD', 'ADMINISTRACION') or p_entity_type is null or not coalesce((select public.document_relation_exists(p_entity_type, p_entity_id)), false) then
    raise exception 'Revisa los datos y la relación del documento.' using errcode = '22023';
  end if;
  update public.documentos set name = pg_catalog.btrim(p_name), document_type = p_type, document_date = p_date, url = p_url, entity_type = p_entity_type, entity_id = p_entity_id, visibility = p_visibility, notes = nullif(pg_catalog.btrim(p_notes), ''), updated_at = pg_catalog.now()
  where id = p_id returning * into v_document;
  if not found then raise exception 'El documento no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_document.id::text, 'name', v_document.name, 'type', v_document.document_type, 'date', v_document.document_date, 'url', v_document.url, 'entityType', v_document.entity_type, 'entityId', v_document.entity_id::text, 'visibility', v_document.visibility, 'notes', coalesce(v_document.notes, ''));
end;
$$;

create or replace function public.delete_document(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar documentos.' using errcode = '42501'; end if;
  delete from public.documentos where id = p_id;
  if not found then raise exception 'El documento no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

revoke all on function public.list_documents() from public, anon;
revoke all on function public.create_document(text, text, date, text, text, uuid, text, text) from public, anon;
revoke all on function public.update_document(uuid, text, text, date, text, text, uuid, text, text) from public, anon;
revoke all on function public.delete_document(uuid) from public, anon;
grant execute on function public.list_documents() to authenticated;
grant execute on function public.create_document(text, text, date, text, text, uuid, text, text) to authenticated;
grant execute on function public.update_document(uuid, text, text, date, text, text, uuid, text, text) to authenticated;
grant execute on function public.delete_document(uuid) to authenticated;
