-- Apply annual ownership costs to the public snapshot before counts and keyset
-- pagination. NULL/missing costs stay unknown; an active maximum excludes them.
-- Existing invoker mode, ACLs, RLS and spatial/offer predicates are preserved.
do $migration$
declare
  definition text := pg_get_functiondef('public.gp_catalog_page_v2(jsonb,jsonb,integer)'::regprocedure);
  patch record;
begin
  if position('Catalog annual cost filters: known amounts only.' in definition) > 0 then
    return;
  end if;
  for patch in select * from (values
    ($before$'minSpaces','sellerType')$before$, $after$'minSpaces','sellerType','annualChargesMax','propertyTaxMax')$after$),
    ($before$array['maxPrice','minPrice','minArea','level','radiusKm','minSpaces']$before$, $after$array['maxPrice','minPrice','minArea','level','radiusKm','minSpaces','annualChargesMax','propertyTaxMax']$after$),
    ($before$ ordering=coalesce(f->>'sort','recent');$before$, $after$ -- Catalog annual cost filters: known amounts only.
 foreach field in array array['annualChargesMax','propertyTaxMax'] loop
   if f->>field is not null and ((f->>field)::numeric not between 0 and 100000000 or trunc((f->>field)::numeric)<>(f->>field)::numeric) then raise exception 'VALIDATION_ERROR';end if;
 end loop;
 ordering=coalesce(f->>'sort','recent');$after$),
    ($before$ and (f->>'sellerType' is null or p.payload->>'sellerTypeSnapshot'=f->>'sellerType')$before$, $after$ and (f->>'sellerType' is null or p.payload->>'sellerTypeSnapshot'=f->>'sellerType')
 and (f->>'annualChargesMax' is null or (p.payload->>'annualChargesCents')::numeric <= (f->>'annualChargesMax')::numeric)
 and (f->>'propertyTaxMax' is null or (p.payload->>'propertyTaxCents')::numeric <= (f->>'propertyTaxMax')::numeric)$after$)
  ) as changes(before_text, after_text) loop
    if position(patch.before_text in definition) = 0
      or cardinality(string_to_array(definition, patch.before_text)) <> 2 then
      raise exception 'Unexpected gp_catalog_page_v2 definition: annual cost migration not applied';
    end if;
    definition := replace(definition, patch.before_text, patch.after_text);
  end loop;
  execute definition;
end;
$migration$;
