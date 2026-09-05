-- Retira el nombre provisional únicamente cuando sigue presente el valor demo.
-- No modifica un nombre que la comunidad haya configurado posteriormente.

update public.config
set value = '"Comunidad Demo"'::jsonb,
    description = 'Nombre ficticio de la comunidad'
where key = 'community_name'
  and value #>> '{}' = 'La Huerta Demo';
