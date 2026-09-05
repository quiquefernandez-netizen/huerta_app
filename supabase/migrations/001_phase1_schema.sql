-- Esquema previsto para Fase 1. No contiene datos reales ni credenciales.
-- Aplicar manualmente solo después de revisar las políticas de acceso.

create extension if not exists pgcrypto;

create table if not exists public.config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null unique,
  members integer not null default 0 check (members >= 0),
  active boolean not null default true,
  notes text,
  joined_at date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references public.familias(id) on delete set null,
  display_name text not null,
  role text not null check (role in ('ADMINISTRADOR', 'NORMAL')),
  active boolean not null default true,
  last_seen_at timestamptz
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('GASTO', 'INGRESO')),
  color text,
  display_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.cuotas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.familias(id),
  type text not null check (type in ('MENSUAL', 'ANUAL', 'DERRAMA')),
  concept text not null,
  period_start date not null,
  period_end date not null,
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  status text not null check (status in ('PENDIENTE', 'PARCIAL', 'PAGADA', 'EXCEDIDA')),
  active boolean not null default true,
  notes text,
  check (period_end >= period_start)
);

create table if not exists public.aportaciones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.familias(id),
  fee_id uuid references public.cuotas(id) on delete set null,
  received_at date not null,
  amount_cents integer not null check (amount_cents > 0),
  type text not null check (type in ('ORDINARIA', 'EXTRAORDINARIA')),
  concept text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  spent_at date not null,
  concept text not null,
  amount_cents integer not null check (amount_cents > 0),
  category_id uuid not null references public.categorias(id),
  provider text,
  notes text,
  created_by uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create table if not exists public.contadores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.familias(id),
  code text not null,
  unit text not null default 'M3' check (unit = 'M3'),
  installed_at date not null,
  initial_reading_m3 numeric(12,3) not null default 0 check (initial_reading_m3 >= 0),
  active boolean not null default true,
  retired_at date,
  retirement_reason text
);

create unique index if not exists one_active_meter_per_family
  on public.contadores (family_id) where active;

create table if not exists public.lecturas_agua (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.familias(id),
  meter_id uuid not null references public.contadores(id),
  read_at date not null,
  reading_m3 numeric(12,3) not null check (reading_m3 >= 0),
  user_id uuid references public.usuarios(id),
  observations text,
  validation_status text not null default 'VALIDA' check (validation_status in ('VALIDA', 'REQUIERE_REVISION', 'AJUSTADA')),
  created_at timestamptz not null default now(),
  unique (meter_id, read_at)
);

create table if not exists public.tarifas_agua (
  id uuid primary key default gen_random_uuid(),
  valid_from date not null,
  valid_until date,
  price_cents_m3 integer not null check (price_cents_m3 >= 0),
  active boolean not null default true,
  notes text,
  check (valid_until is null or valid_until >= valid_from)
);

create table if not exists public.liquidaciones_agua (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.familias(id),
  meter_id uuid not null references public.contadores(id),
  previous_reading_id uuid not null references public.lecturas_agua(id),
  current_reading_id uuid not null references public.lecturas_agua(id),
  consumption_m3 numeric(12,3) not null check (consumption_m3 >= 0),
  tariff_id uuid not null references public.tarifas_agua(id),
  applied_price_cents_m3 integer not null check (applied_price_cents_m3 >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'PAGADA', 'ANULADA')),
  created_at timestamptz not null default now(),
  unique (current_reading_id)
);

-- Cierre seguro por defecto: la API pública no puede acceder a ninguna fila.
-- Las políticas se añadirán al definir la autenticación definitiva.
alter table public.config enable row level security;
alter table public.familias enable row level security;
alter table public.usuarios enable row level security;
alter table public.categorias enable row level security;
alter table public.cuotas enable row level security;
alter table public.aportaciones enable row level security;
alter table public.gastos enable row level security;
alter table public.contadores enable row level security;
alter table public.lecturas_agua enable row level security;
alter table public.tarifas_agua enable row level security;
alter table public.liquidaciones_agua enable row level security;

revoke all on table public.config, public.familias, public.usuarios,
  public.categorias, public.cuotas, public.aportaciones, public.gastos,
  public.contadores, public.lecturas_agua, public.tarifas_agua,
  public.liquidaciones_agua from anon, authenticated;
