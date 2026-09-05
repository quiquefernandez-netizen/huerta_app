-- Las altas compartidas quedan exclusivamente tras RPC. Administración
-- conserva las capacidades de corrección y eliminación ya cubiertas por RLS.

grant update, delete on table
  public.aportaciones, public.gastos, public.gasto_pagadores,
  public.derramas, public.derrama_familias, public.lecturas_agua
to authenticated;
