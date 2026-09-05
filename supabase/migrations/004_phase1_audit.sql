-- Auditoría automática de las escrituras relevantes de Fase 1.
-- La función solo puede ejecutarse como trigger: el cliente no puede fabricar
-- entradas de auditoría mediante la API pública.

create or replace function public.audit_phase1_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_entity_id uuid;
begin
  v_row := case
    when TG_OP = 'DELETE' then pg_catalog.to_jsonb(OLD)
    else pg_catalog.to_jsonb(NEW)
  end;
  v_entity_id := (v_row ->> 'id')::uuid;

  insert into public.auditoria (user_id, action, entity, entity_id, detail)
  values (
    (select auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    v_row - array['id', 'notes', 'observations', 'created_at']
  );

  return null;
end;
$$;

revoke all on function public.audit_phase1_change() from public, anon, authenticated;

drop trigger if exists audit_familias_changes on public.familias;
create trigger audit_familias_changes
after insert or update or delete on public.familias
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_cuotas_changes on public.cuotas;
create trigger audit_cuotas_changes
after insert or update or delete on public.cuotas
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_aportaciones_changes on public.aportaciones;
create trigger audit_aportaciones_changes
after insert or update or delete on public.aportaciones
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_gastos_changes on public.gastos;
create trigger audit_gastos_changes
after insert or update or delete on public.gastos
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_lecturas_agua_changes on public.lecturas_agua;
create trigger audit_lecturas_agua_changes
after insert or update or delete on public.lecturas_agua
for each row execute function public.audit_phase1_change();

drop trigger if exists audit_liquidaciones_agua_changes on public.liquidaciones_agua;
create trigger audit_liquidaciones_agua_changes
after insert or update or delete on public.liquidaciones_agua
for each row execute function public.audit_phase1_change();
