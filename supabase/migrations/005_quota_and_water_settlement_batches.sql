-- Modelo acordado después del primer prototipo visual.
-- Permanece cerrado por defecto hasta sustituir la autenticación anterior por
-- los accesos Normal/Administrador con contraseñas validadas en servidor.

create table if not exists public.planes_cuota (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique check (year between 2020 and 2100),
  monthly_amount_cents integer not null check (monthly_amount_cents >= 0),
  annual_amount_cents integer not null check (annual_amount_cents = monthly_amount_cents * 12),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cuotas
  add column if not exists quota_plan_id uuid references public.planes_cuota(id);

create table if not exists public.lotes_liquidacion_agua (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  tariff_id uuid not null references public.tarifas_agua(id),
  total_consumption_m3 numeric(12,3) not null check (total_consumption_m3 >= 0),
  total_amount_cents integer not null check (total_amount_cents >= 0),
  status text not null default 'BORRADOR' check (status in ('BORRADOR', 'EMITIDA', 'ANULADA')),
  created_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.liquidaciones_agua
  add column if not exists settlement_batch_id uuid references public.lotes_liquidacion_agua(id);

alter table public.planes_cuota enable row level security;
alter table public.lotes_liquidacion_agua enable row level security;

revoke all on table public.planes_cuota, public.lotes_liquidacion_agua from anon, authenticated;

drop trigger if exists audit_planes_cuota_changes on public.planes_cuota;
create trigger audit_planes_cuota_changes
after insert or update or delete on public.planes_cuota
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_lotes_liquidacion_agua_changes on public.lotes_liquidacion_agua;
create trigger audit_lotes_liquidacion_agua_changes
after insert or update or delete on public.lotes_liquidacion_agua
for each row execute function public.audit_phase1_change();
