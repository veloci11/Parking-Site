-- Read-only contract checks against the currently published catalogue.
-- Unknown/missing costs must never be treated as zero.
begin;
set local role anon;
do $test$
declare
  actual bigint;
  expected bigint;
  field text;
  invalid_filter jsonb;
begin
  foreach field in array array['annualChargesMax','propertyTaxMax'] loop
    select (public.gp_catalog_page_v2(jsonb_build_object(field,100000000),null,24)->>'total')::bigint into actual;
    select count(*) into expected
    from public.published_listings p
    where (p.payload->>(case when field='annualChargesMax' then 'annualChargesCents' else 'propertyTaxCents' end))::numeric<=100000000
      and public.gp_catalog_offer_match(p.payload,'{}') is not null;
    if actual<>expected then raise exception 'Annual cost catalogue count mismatch: %',field;end if;
  end loop;
  foreach invalid_filter in array array[
    '{"annualChargesMax":-1}'::jsonb,
    '{"propertyTaxMax":1.5}'::jsonb,
    '{"annualChargesMax":"100"}'::jsonb,
    '{"propertyTaxMax":100000001}'::jsonb
  ] loop
    begin
      perform public.gp_catalog_page_v2(invalid_filter,null,24);
      raise exception 'INVALID_FILTER_ACCEPTED';
    exception when others then
      if sqlerrm<>'VALIDATION_ERROR' then raise;end if;
    end;
  end loop;
end;
$test$;
rollback;
