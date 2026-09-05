-- Añade la categoría prevista para impuestos y tasas a instalaciones existentes.
-- No crea movimientos ni importes: únicamente amplía el catálogo configurable.

insert into public.categorias (id, name, type, color, display_order, active)
values (
  '20000000-0000-4000-8000-000000000007',
  'Impuestos / tasas',
  'GASTO',
  '#7b6f94',
  7,
  true
)
on conflict (name) do update
set type = excluded.type,
    color = excluded.color,
    display_order = excluded.display_order,
    active = true;
