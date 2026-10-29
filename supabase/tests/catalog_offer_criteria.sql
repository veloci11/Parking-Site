-- Read-only RPC validation under the anonymous role. No catalogue records are written.
begin;
set local role anon;
do $test$
declare
  criteria jsonb;
  result jsonb;
  rejected boolean;
begin
  for criteria in select value from jsonb_array_elements('[{}, {"minSpaces":1}, {"minSpaces":500}, {"sellerType":"private"}, {"sellerType":"professional"}, {"minSpaces":2,"sellerType":"private"}, {"minSpaces":null,"sellerType":null}]') loop
    result := public.gp_catalog_page_v2(criteria, null, 1);
    if jsonb_typeof(result->'items') <> 'array' or jsonb_array_length(result->'items') > 1 or (result->>'total')::integer < 0 then
      raise exception 'Invalid result for %', criteria;
    end if;
  end loop;
  for criteria in select value from jsonb_array_elements('[{"minSpaces":0}, {"minSpaces":501}, {"minSpaces":1.5}, {"minSpaces":"2"}, {"minSpaces":true}, {"sellerType":"agency"}, {"sellerType":1}, {"sellerType":""}]') loop
    rejected := false;
    begin
      perform public.gp_catalog_page_v2(criteria, null, 1);
    exception when others then
      if sqlerrm = 'VALIDATION_ERROR' then rejected := true; else raise; end if;
    end;
    if not rejected then raise exception 'Invalid criteria accepted: %', criteria; end if;
  end loop;
end;
$test$;
rollback;

