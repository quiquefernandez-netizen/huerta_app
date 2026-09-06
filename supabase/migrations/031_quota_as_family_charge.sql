-- La cuota mensual pasa a ser un cargo real de la cuenta familiar.
-- Las aportaciones siguen siendo abonos independientes y pueden cubrir cuota,
-- agua y derramas; el saldo resultante puede quedar a favor o pendiente.

create or replace view public.movimientos_cuenta_familia
with (security_invoker = true)
as
  select contribution.id::text as movement_id, contribution.family_id,
    contribution.received_at as occurred_at, 'APORTACION'::text as source_type,
    contribution.concept, contribution.amount_cents::bigint as amount_cents
  from public.aportaciones contribution
  union all
  select fee.id::text, fee.family_id, fee.period_start,
    'CUOTA', fee.concept, -fee.amount_cents::bigint
  from public.cuotas fee
  where fee.active and fee.quota_plan_id is not null and fee.period_start <= current_date
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

revoke all on public.movimientos_cuenta_familia from anon;
grant select on table public.movimientos_cuenta_familia to authenticated;
