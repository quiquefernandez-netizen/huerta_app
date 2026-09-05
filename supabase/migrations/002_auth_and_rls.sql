-- Acceso compartido Normal/Administrador para un frontend estático.
-- Las contraseñas se guardan con bcrypt en un esquema no expuesto y solo una
-- Edge Function con credenciales de servidor puede comprobarlas.

alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios
  add constraint usuarios_role_check check (role in ('ADMINISTRADOR', 'NORMAL'));

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid references public.usuarios(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb
);
alter table public.auditoria enable row level security;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.access_credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  role text not null check (role in ('ADMINISTRADOR', 'NORMAL')),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists private.app_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  credential_id uuid not null references private.access_credentials(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists private.access_attempts (
  id bigint generated always as identity primary key,
  client_key text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index if not exists access_attempts_rate_limit
  on private.access_attempts (client_key, attempted_at desc);

revoke all on table private.access_credentials, private.app_sessions, private.access_attempts
  from public, anon, authenticated;

create or replace function public.current_access_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select credential.role
  from private.app_sessions session
  join private.access_credentials credential on credential.id = session.credential_id
  where session.auth_user_id = (select auth.uid())
    and session.revoked_at is null
    and session.expires_at > pg_catalog.now()
    and credential.active
    and credential.revoked_at is null
  limit 1;
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.current_access_role()) is not null;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.current_access_role()) = 'ADMINISTRADOR';
$$;

-- Compatibilidad temporal con la migración 003. El acceso vigente no asigna
-- una identidad familiar y las lecturas se comparten entre ambos perfiles.
create or replace function public.current_user_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select null::uuid; $$;

revoke all on function public.current_access_role() from public, anon;
revoke all on function public.current_user_is_active() from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
revoke all on function public.current_user_family_id() from public, anon;
grant execute on function public.current_access_role() to authenticated;
grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_family_id() to authenticated;

-- Solo el contexto de servidor puede crear una credencial. No se incluye
-- ninguna contraseña inicial en el repositorio.
create or replace function public.create_access_credential(
  p_label text,
  p_role text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if nullif(pg_catalog.btrim(p_label), '') is null then
    raise exception 'La credencial necesita un nombre.' using errcode = '22023';
  end if;
  if p_role not in ('ADMINISTRADOR', 'NORMAL') then
    raise exception 'El perfil no es válido.' using errcode = '22023';
  end if;
  if pg_catalog.length(p_password) < 10 then
    raise exception 'La contraseña debe tener al menos 10 caracteres.' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.access_credentials credential
    where credential.active and public.crypt(p_password, credential.password_hash) = credential.password_hash
  ) then
    raise exception 'Esta contraseña ya está asignada a otra credencial.' using errcode = '23505';
  end if;
  insert into private.access_credentials (label, role, password_hash)
  values (pg_catalog.left(pg_catalog.btrim(p_label), 80), p_role, public.crypt(p_password, public.gen_salt('bf', 12)))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_access_credential(p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.access_credentials
    set active = false, revoked_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_credential_id;
  update private.app_sessions
    set revoked_at = pg_catalog.now()
    where credential_id = p_credential_id and revoked_at is null;
end;
$$;

-- La Edge Function verifica primero el JWT anónimo y llama a esta función con
-- el rol de servidor. Los fallos se registran sin guardar la contraseña.
create or replace function public.unlock_access(
  p_auth_user_id uuid,
  p_password text,
  p_client_key text,
  p_remember boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential private.access_credentials%rowtype;
  v_expires_at timestamptz;
begin
  delete from private.access_attempts where attempted_at < pg_catalog.now() - interval '24 hours';
  if (
    select pg_catalog.count(*) >= 5
    from private.access_attempts
    where client_key = p_client_key
      and not success
      and attempted_at > pg_catalog.now() - interval '15 minutes'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'TOO_MANY_ATTEMPTS');
  end if;

  select credential.* into v_credential
  from private.access_credentials credential
  where credential.active
    and credential.revoked_at is null
    and public.crypt(p_password, credential.password_hash) = credential.password_hash
  limit 1;

  if not found then
    insert into private.access_attempts (client_key, success) values (p_client_key, false);
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  insert into private.access_attempts (client_key, success) values (p_client_key, true);
  v_expires_at := pg_catalog.now() + case when p_remember then interval '30 days' else interval '12 hours' end;

  insert into public.usuarios (id, display_name, role, active, last_seen_at)
  values (p_auth_user_id, v_credential.label, v_credential.role, true, pg_catalog.now())
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    active = true,
    last_seen_at = excluded.last_seen_at;

  insert into private.app_sessions (auth_user_id, credential_id, expires_at)
  values (p_auth_user_id, v_credential.id, v_expires_at)
  on conflict (auth_user_id) do update set
    credential_id = excluded.credential_id,
    expires_at = excluded.expires_at,
    created_at = pg_catalog.now(),
    last_seen_at = pg_catalog.now(),
    revoked_at = null;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'role', v_credential.role,
    'display_name', v_credential.label,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.create_access_credential(text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_access_credential(uuid) from public, anon, authenticated;
revoke all on function public.unlock_access(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_access_credential(text, text, text) to service_role;
grant execute on function public.revoke_access_credential(uuid) to service_role;
grant execute on function public.unlock_access(uuid, text, text, boolean) to service_role;

grant select, insert, update, delete on table
  public.config, public.familias, public.usuarios, public.categorias,
  public.cuotas, public.aportaciones, public.gastos, public.contadores,
  public.lecturas_agua, public.tarifas_agua, public.liquidaciones_agua,
  public.auditoria
to authenticated;
revoke all on table
  public.config, public.familias, public.usuarios, public.categorias,
  public.cuotas, public.aportaciones, public.gastos, public.contadores,
  public.lecturas_agua, public.tarifas_agua, public.liquidaciones_agua,
  public.auditoria
from anon;

-- Los dos perfiles consultan toda la información comunitaria. Por ahora las
-- escrituras de la API quedan en administración, que es el límite más seguro
-- mientras se decide qué altas podrá realizar el perfil Normal.
create policy usuarios_select_own_or_admin on public.usuarios for select to authenticated
  using (id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy usuarios_admin_write on public.usuarios for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy familias_active_select on public.familias for select to authenticated
  using ((select public.current_user_is_active()));
create policy familias_admin_write on public.familias for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy config_active_select on public.config for select to authenticated
  using ((select public.current_user_is_active()));
create policy config_admin_write on public.config for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy categorias_active_select on public.categorias for select to authenticated
  using ((select public.current_user_is_active()));
create policy categorias_admin_write on public.categorias for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy cuotas_active_select on public.cuotas for select to authenticated
  using ((select public.current_user_is_active()));
create policy cuotas_admin_write on public.cuotas for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy aportaciones_active_select on public.aportaciones for select to authenticated
  using ((select public.current_user_is_active()));
create policy aportaciones_admin_write on public.aportaciones for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy gastos_active_select on public.gastos for select to authenticated
  using ((select public.current_user_is_active()));
create policy gastos_admin_write on public.gastos for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy contadores_active_select on public.contadores for select to authenticated
  using ((select public.current_user_is_active()));
create policy contadores_admin_write on public.contadores for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy lecturas_active_select on public.lecturas_agua for select to authenticated
  using ((select public.current_user_is_active()));
create policy lecturas_admin_write on public.lecturas_agua for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy tarifas_active_select on public.tarifas_agua for select to authenticated
  using ((select public.current_user_is_active()));
create policy tarifas_admin_write on public.tarifas_agua for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy liquidaciones_active_select on public.liquidaciones_agua for select to authenticated
  using ((select public.current_user_is_active()));
create policy liquidaciones_admin_write on public.liquidaciones_agua for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy auditoria_admin_select on public.auditoria for select to authenticated
  using ((select public.current_user_is_admin()));
