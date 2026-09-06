-- Fase 3: votaciones internas por familia, con cambio de voto mientras estén abiertas.

create table if not exists public.votaciones (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.propuestas(id) on delete cascade,
  status text not null default 'ABIERTA' check (status in ('ABIERTA', 'CERRADA')),
  opened_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'ABIERTA' and closed_at is null) or (status = 'CERRADA' and closed_at is not null))
);

create table if not exists public.votos (
  id uuid primary key default gen_random_uuid(),
  voting_id uuid not null references public.votaciones(id) on delete cascade,
  family_id uuid not null references public.familias(id),
  vote text not null check (vote in ('FAVOR', 'CONTRA', 'ABSTENCION')),
  voted_by uuid references auth.users(id),
  voted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (voting_id, family_id)
);

create index if not exists votos_voting_idx on public.votos (voting_id, vote);

alter table public.votaciones enable row level security;
alter table public.votos enable row level security;
revoke all on table public.votaciones, public.votos from anon, authenticated;

drop trigger if exists audit_votaciones_changes on public.votaciones;
create trigger audit_votaciones_changes after insert or update or delete on public.votaciones
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_votos_changes on public.votos;
create trigger audit_votos_changes after insert or update or delete on public.votos
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
      ), '[]'::jsonb),
      'voting', (
        select pg_catalog.jsonb_build_object(
          'id', voting.id::text,
          'status', voting.status,
          'openedAt', voting.opened_at,
          'closedAt', voting.closed_at,
          'votes', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'familyId', family.id::text,
              'familyName', family.name,
              'vote', vote.vote,
              'date', vote.updated_at
            ) order by family.name)
            from public.votos vote
            join public.familias family on family.id = vote.family_id
            where vote.voting_id = voting.id
          ), '[]'::jsonb)
        )
        from public.votaciones voting where voting.proposal_id = proposal.id
      )
    ) order by proposal.proposed_on desc, proposal.created_at desc)
    from public.propuestas proposal
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_proposal_voting_status(p_proposal_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_voting public.votaciones%rowtype;
begin
  if not (select public.current_user_is_admin()) then raise exception 'Solo administración puede abrir o cerrar votaciones.' using errcode = '42501'; end if;
  if p_status not in ('ABIERTA', 'CERRADA') then raise exception 'El estado de la votación no es válido.' using errcode = '22023'; end if;
  if not exists (select 1 from public.propuestas where id = p_proposal_id) then raise exception 'La propuesta no existe.' using errcode = '22023'; end if;

  select * into v_voting from public.votaciones where proposal_id = p_proposal_id for update;
  if not found then
    if p_status <> 'ABIERTA' then raise exception 'Primero hay que abrir la votación.' using errcode = '22023'; end if;
    insert into public.votaciones (proposal_id, status, opened_by)
    values (p_proposal_id, 'ABIERTA', (select auth.uid())) returning * into v_voting;
    update public.propuestas set status = 'PENDIENTE_VOTACION', updated_at = pg_catalog.now() where id = p_proposal_id;
  elsif v_voting.status = 'CERRADA' then
    raise exception 'La votación ya está cerrada y conserva su resultado.' using errcode = '22023';
  elsif p_status = 'CERRADA' then
    update public.votaciones set status = 'CERRADA', closed_by = (select auth.uid()), closed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_voting.id returning * into v_voting;
  end if;

  return pg_catalog.jsonb_build_object('id', v_voting.id::text, 'status', v_voting.status, 'openedAt', v_voting.opened_at, 'closedAt', v_voting.closed_at);
end;
$$;

create or replace function public.cast_proposal_vote(p_proposal_id uuid, p_family_id uuid, p_vote text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_voting_id uuid; v_vote public.votos%rowtype;
begin
  if not (select public.current_user_is_active()) then raise exception 'Necesitas una sesión activa para votar.' using errcode = '42501'; end if;
  if p_vote not in ('FAVOR', 'CONTRA', 'ABSTENCION') then raise exception 'El voto no es válido.' using errcode = '22023'; end if;
  if not exists (select 1 from public.familias where id = p_family_id and active) then raise exception 'La familia no existe o está inactiva.' using errcode = '22023'; end if;
  select id into v_voting_id from public.votaciones where proposal_id = p_proposal_id and status = 'ABIERTA';
  if v_voting_id is null then raise exception 'La votación no está abierta.' using errcode = '22023'; end if;

  insert into public.votos (voting_id, family_id, vote, voted_by)
  values (v_voting_id, p_family_id, p_vote, (select auth.uid()))
  on conflict (voting_id, family_id) do update
  set vote = excluded.vote, voted_by = excluded.voted_by, updated_at = pg_catalog.now()
  returning * into v_vote;

  return pg_catalog.jsonb_build_object('familyId', v_vote.family_id::text, 'vote', v_vote.vote, 'date', v_vote.updated_at);
end;
$$;

revoke all on function public.list_proposals() from public, anon;
revoke all on function public.set_proposal_voting_status(uuid, text) from public, anon;
revoke all on function public.cast_proposal_vote(uuid, uuid, text) from public, anon;
grant execute on function public.list_proposals() to authenticated;
grant execute on function public.set_proposal_voting_status(uuid, text) to authenticated;
grant execute on function public.cast_proposal_vote(uuid, uuid, text) to authenticated;
