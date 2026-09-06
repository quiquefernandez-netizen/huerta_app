-- Fase 3: propuestas sencillas con varios presupuestos.

create table if not exists public.propuestas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  proposed_on date not null default current_date,
  estimated_budget_cents integer check (estimated_budget_cents is null or estimated_budget_cents >= 0),
  status text not null default 'IDEA' check (status in ('IDEA', 'EN_ESTUDIO', 'PENDIENTE_VOTACION', 'APROBADA', 'RECHAZADA', 'EN_EJECUCION', 'FINALIZADA')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_catalog.length(pg_catalog.btrim(title)) between 3 and 120),
  check (pg_catalog.length(pg_catalog.btrim(description)) between 3 and 5000)
);

create table if not exists public.presupuestos_propuesta (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.propuestas(id) on delete cascade,
  provider text not null,
  amount_cents integer not null check (amount_cents > 0),
  description text,
  quoted_on date not null default current_date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_catalog.length(pg_catalog.btrim(provider)) between 2 and 120)
);

create index if not exists propuestas_status_date_idx on public.propuestas (status, proposed_on desc);
create index if not exists presupuestos_propuesta_proposal_idx on public.presupuestos_propuesta (proposal_id, amount_cents);

alter table public.propuestas enable row level security;
alter table public.presupuestos_propuesta enable row level security;
revoke all on table public.propuestas, public.presupuestos_propuesta from anon, authenticated;

drop trigger if exists audit_propuestas_changes on public.propuestas;
create trigger audit_propuestas_changes after insert or update or delete on public.propuestas
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_presupuestos_propuesta_changes on public.presupuestos_propuesta;
create trigger audit_presupuestos_propuesta_changes after insert or update or delete on public.presupuestos_propuesta
for each row execute function public.audit_phase1_change();

create or replace function public.list_proposals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para consultar propuestas.' using errcode = '42501'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', proposal.id::text,
      'title', proposal.title,
      'description', proposal.description,
      'date', proposal.proposed_on,
      'estimatedBudgetCents', proposal.estimated_budget_cents,
      'status', proposal.status,
      'notes', coalesce(proposal.notes, ''),
      'budgets', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', budget.id::text,
          'provider', budget.provider,
          'amountCents', budget.amount_cents,
          'description', coalesce(budget.description, ''),
          'date', budget.quoted_on,
          'notes', coalesce(budget.notes, '')
        ) order by budget.amount_cents, budget.quoted_on)
        from public.presupuestos_propuesta budget where budget.proposal_id = proposal.id
      ), '[]'::jsonb)
    ) order by proposal.proposed_on desc, proposal.created_at desc)
    from public.propuestas proposal
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_proposal(
  p_title text,
  p_description text,
  p_proposed_on date default current_date,
  p_estimated_budget_cents integer default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_proposal public.propuestas%rowtype;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para crear una propuesta.' using errcode = '42501'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 3 and 120 then raise exception 'El título debe tener entre 3 y 120 caracteres.' using errcode = '22023'; end if;
  if p_description is null or pg_catalog.length(pg_catalog.btrim(p_description)) not between 3 and 5000 then raise exception 'Explica brevemente la propuesta.' using errcode = '22023'; end if;
  if p_proposed_on is null or p_estimated_budget_cents < 0 then raise exception 'La fecha o el presupuesto estimado no son válidos.' using errcode = '22023'; end if;
  insert into public.propuestas (title, description, proposed_on, estimated_budget_cents, notes, created_by)
  values (pg_catalog.btrim(p_title), pg_catalog.btrim(p_description), p_proposed_on, p_estimated_budget_cents, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid()))
  returning * into v_proposal;
  return pg_catalog.jsonb_build_object('id', v_proposal.id::text, 'title', v_proposal.title, 'description', v_proposal.description, 'date', v_proposal.proposed_on, 'estimatedBudgetCents', v_proposal.estimated_budget_cents, 'status', v_proposal.status, 'notes', coalesce(v_proposal.notes, ''), 'budgets', '[]'::jsonb);
end;
$$;

create or replace function public.update_proposal(
  p_id uuid,
  p_title text,
  p_description text,
  p_proposed_on date,
  p_estimated_budget_cents integer default null,
  p_status text default 'IDEA',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_proposal public.propuestas%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede modificar propuestas.' using errcode = '42501'; end if;
  if p_title is null or pg_catalog.length(pg_catalog.btrim(p_title)) not between 3 and 120 or p_description is null or pg_catalog.length(pg_catalog.btrim(p_description)) not between 3 and 5000 then raise exception 'Revisa el título y la descripción.' using errcode = '22023'; end if;
  if p_proposed_on is null or p_estimated_budget_cents < 0 or p_status not in ('IDEA', 'EN_ESTUDIO', 'PENDIENTE_VOTACION', 'APROBADA', 'RECHAZADA', 'EN_EJECUCION', 'FINALIZADA') then raise exception 'La propuesta no es válida.' using errcode = '22023'; end if;
  update public.propuestas set title = pg_catalog.btrim(p_title), description = pg_catalog.btrim(p_description), proposed_on = p_proposed_on, estimated_budget_cents = p_estimated_budget_cents, status = p_status, notes = nullif(pg_catalog.btrim(p_notes), ''), updated_at = pg_catalog.now()
  where id = p_id returning * into v_proposal;
  if not found then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;
  return pg_catalog.jsonb_build_object('id', v_proposal.id::text, 'title', v_proposal.title, 'description', v_proposal.description, 'date', v_proposal.proposed_on, 'estimatedBudgetCents', v_proposal.estimated_budget_cents, 'status', v_proposal.status, 'notes', coalesce(v_proposal.notes, ''));
end;
$$;

create or replace function public.delete_proposal(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar propuestas.' using errcode = '42501'; end if;
  delete from public.propuestas where id = p_id;
  if not found then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

create or replace function public.create_proposal_budget(
  p_proposal_id uuid,
  p_provider text,
  p_amount_cents integer,
  p_description text default null,
  p_quoted_on date default current_date,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_budget public.presupuestos_propuesta%rowtype;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para añadir un presupuesto.' using errcode = '42501'; end if;
  if not exists (select 1 from public.propuestas where id = p_proposal_id) then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;
  if p_provider is null or pg_catalog.length(pg_catalog.btrim(p_provider)) not between 2 and 120 or p_amount_cents is null or p_amount_cents <= 0 or p_quoted_on is null then raise exception 'Revisa proveedor, importe y fecha.' using errcode = '22023'; end if;
  insert into public.presupuestos_propuesta (proposal_id, provider, amount_cents, description, quoted_on, notes, created_by)
  values (p_proposal_id, pg_catalog.btrim(p_provider), p_amount_cents, nullif(pg_catalog.btrim(p_description), ''), p_quoted_on, nullif(pg_catalog.btrim(p_notes), ''), (select auth.uid())) returning * into v_budget;
  return pg_catalog.jsonb_build_object('id', v_budget.id::text, 'provider', v_budget.provider, 'amountCents', v_budget.amount_cents, 'description', coalesce(v_budget.description, ''), 'date', v_budget.quoted_on, 'notes', coalesce(v_budget.notes, ''));
end;
$$;

create or replace function public.delete_proposal_budget(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede eliminar presupuestos.' using errcode = '42501'; end if;
  delete from public.presupuestos_propuesta where id = p_id;
  if not found then raise exception 'El presupuesto no existe.' using errcode = '22023'; end if;
  return true;
end;
$$;

revoke all on function public.list_proposals() from public, anon;
revoke all on function public.create_proposal(text, text, date, integer, text) from public, anon;
revoke all on function public.update_proposal(uuid, text, text, date, integer, text, text) from public, anon;
revoke all on function public.delete_proposal(uuid) from public, anon;
revoke all on function public.create_proposal_budget(uuid, text, integer, text, date, text) from public, anon;
revoke all on function public.delete_proposal_budget(uuid) from public, anon;
grant execute on function public.list_proposals() to authenticated;
grant execute on function public.create_proposal(text, text, date, integer, text) to authenticated;
grant execute on function public.update_proposal(uuid, text, text, date, integer, text, text) to authenticated;
grant execute on function public.delete_proposal(uuid) to authenticated;
grant execute on function public.create_proposal_budget(uuid, text, integer, text, date, text) to authenticated;
grant execute on function public.delete_proposal_budget(uuid) to authenticated;
