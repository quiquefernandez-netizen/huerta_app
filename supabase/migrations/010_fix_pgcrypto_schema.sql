-- Supabase instala pgcrypto en extensions. Las funciones de acceso deben
-- referenciarlo explícitamente porque usan search_path vacío.

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
    where credential.active and extensions.crypt(p_password, credential.password_hash) = credential.password_hash
  ) then
    raise exception 'Esta contraseña ya está asignada a otra credencial.' using errcode = '23505';
  end if;
  insert into private.access_credentials (label, role, password_hash)
  values (
    pg_catalog.left(pg_catalog.btrim(p_label), 80),
    p_role,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  )
  returning id into v_id;
  return v_id;
end;
$$;

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
    and extensions.crypt(p_password, credential.password_hash) = credential.password_hash
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
revoke all on function public.unlock_access(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_access_credential(text, text, text) to service_role;
grant execute on function public.unlock_access(uuid, text, text, boolean) to service_role;
