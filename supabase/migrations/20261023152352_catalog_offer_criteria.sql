-- Filter the existing public projection before count/keyset pagination.
-- No profile join, second catalogue scan, table write, or permission change.
do $migration$
declare
  definition text := pg_get_functiondef('public.gp_catalog_page_v2(jsonb,jsonb,integer)'::regprocedure);
  patch record;
begin
  if position('Catalog offer criteria: available-space count and public seller snapshot.' in definition) > 0 then
    return;
  end if;
  for patch in select * from (values
      ($before$'center','radiusKm','ids')$before$, $after$'center','radiusKm','ids','minSpaces','sellerType')$after$),
      ($before$array['query','type','transactionType','sort','occupancy']$before$, $after$array['query','type','transactionType','sort','occupancy','sellerType']$after$),
      ($before$array['maxPrice','minPrice','minArea','level','radiusKm']$before$, $after$array['maxPrice','minPrice','minArea','level','radiusKm','minSpaces']$after$),
      ($before$ ordering=coalesce(f->>'sort','recent');$before$, $after$ -- Catalog offer criteria: available-space count and public seller snapshot.
 if f->>'minSpaces' is not null and ((f->>'minSpaces')::numeric not between 1 and 500 or trunc((f->>'minSpaces')::numeric)<>(f->>'minSpaces')::numeric) then raise exception 'VALIDATION_ERROR';end if;
 if f->>'sellerType' is not null and f->>'sellerType' not in ('private','professional') then raise exception 'VALIDATION_ERROR';end if;
 ordering=coalesce(f->>'sort','recent');$after$),
      ($before$where p.created_at<=snapshot_at and offer_match.value is not null$before$, $after$where p.created_at<=snapshot_at and offer_match.value is not null
 and (f->>'minSpaces' is null or (offer_match.value->>'spaceCount')::integer >= (f->>'minSpaces')::integer)
 and (f->>'sellerType' is null or p.payload->>'sellerTypeSnapshot'=f->>'sellerType')$after$)
  ) as changes(before_text, after_text) loop
    if position(patch.before_text in definition) = 0
      or cardinality(string_to_array(definition, patch.before_text)) <> 2 then
      raise exception 'Unexpected gp_catalog_page_v2 definition: criteria migration not applied';
    end if;
    definition := replace(definition, patch.before_text, patch.after_text);
  end loop;
  execute definition;
end;
$migration$;

