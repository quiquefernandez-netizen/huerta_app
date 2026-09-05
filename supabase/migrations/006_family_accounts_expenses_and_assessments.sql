-- Cuenta corriente familiar: los saldos se calculan desde documentos origen.
-- Cerrado por defecto hasta implementar los accesos Normal/Administrador.

alter table public.gastos
  add column if not exists payment_source text not null default 'COMMUNITY'
  check (payment_source in ('COMMUNITY', 'FAMILIES'));

alter table public.cuotas drop constraint if exists cuotas_type_check;
alter table public.cuotas
  add constraint cuotas_type_check check (type in ('MENSUAL', 'ANUAL'));

create table if not exists public.gasto_pagadores (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.gastos(id) on delete cascade,
  family_id uuid not null references public.familias(id),
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (expense_id, family_id)
);

create table if not exists public.derramas (
  id uuid primary key default gen_random_uuid(),
  assessed_at date not null,
  concept text not null,
  total_amount_cents integer not null check (total_amount_cents > 0),
  status text not null default 'ACTIVA' check (status in ('BORRADOR', 'ACTIVA', 'ANULADA')),
  notes text,
  created_by uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create table if not exists public.derrama_familias (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.derramas(id) on delete cascade,
  family_id uuid not null references public.familias(id),
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (assessment_id, family_id)
);

alter table public.gasto_pagadores enable row level security;
alter table public.derramas enable row level security;
alter table public.derrama_familias enable row level security;

revoke all on table public.gasto_pagadores, public.derramas, public.derrama_familias from anon, authenticated;

-- Vista única para consultar cargos (-) y abonos (+) sin duplicar importes.
create or replace view public.movimientos_cuenta_familia
with (security_invoker = true)
as
  select contribution.id::text as movement_id, contribution.family_id,
    contribution.received_at as occurred_at, 'APORTACION'::text as source_type,
    contribution.concept, contribution.amount_cents::bigint as amount_cents
  from public.aportaciones contribution
  union all
  select fee.id::text, fee.family_id, fee.period_start, 'CUOTA', fee.concept,
    -fee.amount_cents::bigint
  from public.cuotas fee
  where fee.active
  union all
  select settlement.id::text, settlement.family_id, settlement.created_at::date,
    'AGUA', 'Liquidación de agua', -settlement.amount_cents::bigint
  from public.liquidaciones_agua settlement
  where settlement.status <> 'ANULADA'
  union all
  select allocation.id::text, allocation.family_id, assessment.assessed_at,
    'DERRAMA', assessment.concept, -allocation.amount_cents::bigint
  from public.derrama_familias allocation
  join public.derramas assessment on assessment.id = allocation.assessment_id
  where assessment.status = 'ACTIVA'
  union all
  select payer.id::text, payer.family_id, expense.spent_at,
    'GASTO_ADELANTADO', expense.concept, payer.amount_cents::bigint
  from public.gasto_pagadores payer
  join public.gastos expense on expense.id = payer.expense_id
  where expense.payment_source = 'FAMILIES';

revoke all on public.movimientos_cuenta_familia from anon, authenticated;

drop trigger if exists audit_gasto_pagadores_changes on public.gasto_pagadores;
create trigger audit_gasto_pagadores_changes
after insert or update or delete on public.gasto_pagadores
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_derramas_changes on public.derramas;
create trigger audit_derramas_changes
after insert or update or delete on public.derramas
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_derrama_familias_changes on public.derrama_familias;
create trigger audit_derrama_familias_changes
after insert or update or delete on public.derrama_familias
for each row execute function public.audit_phase1_change();
