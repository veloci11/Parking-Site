-- An explicit unknown floor is descriptive inventory, never a physical ground floor.
-- Existing records without levelKnown retain their current known-level behavior.
-- No new RPC or privileges. Existing wrapper ownership and publication gates stay intact.
begin;
do $migration$
declare target regprocedure; old_text text; new_text text; expected_count integer;
 before_definition text; after_definition text;
begin
 for target, old_text, new_text, expected_count in select * from (values
  ('public.gp_validate_offers(jsonb,boolean)'::regprocedure, $old$('id','number','level','areaM2','lengthM','widthM','clearanceM','offer')$old$, $new$('id','number','level','levelKnown','areaM2','lengthM','widthM','clearanceM','offer')$new$, 1),
  ('public.gp_validate_offers(jsonb,boolean)'::regprocedure, $old$if jsonb_typeof(s) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;$old$, $new$if jsonb_typeof(s) is distinct from 'object' then raise exception 'VALIDATION_ERROR';end if;
 if s ? 'levelKnown' and (jsonb_typeof(s->'levelKnown') is distinct from 'boolean' or (s->'levelKnown'='false'::jsonb and s->'level' is distinct from '0'::jsonb)) then raise exception 'VALIDATION_ERROR';end if;$new$, 1),
  ('public.gp_public_payload(jsonb)'::regprocedure, $old$end if;return result;end;$old$, $new$end if;
 result=jsonb_set(result,'{spaces}',coalesce((select jsonb_agg(s||case when p->'spaces'->(n::integer-1) ? 'levelKnown' then jsonb_build_object('levelKnown',p->'spaces'->(n::integer-1)->'levelKnown') else '{}'::jsonb end order by n) from jsonb_array_elements(result->'spaces')with ordinality u(s,n)),'[]'));
 return result;end;$new$, 1),
  ('public.gp_catalog_offer_match(jsonb,jsonb)'::regprocedure, $old$(s->>'level')::integer=lev$old$, $new$(s->'levelKnown' is distinct from 'false'::jsonb and (s->>'level')::integer=lev)$new$, 2),
  ('public.gp_registry_command_before_common_plans(jsonb)'::regprocedure, $old$if space_unit is null or physical.id is null$old$, $new$if space_unit is null or space_unit->'levelKnown'='false'::jsonb or physical.id is null$new$, 1),
  ('public.gp_scene_mapping(jsonb,jsonb,boolean)'::regprocedure, $old$if p_approval and$old$, $new$if exists(select 1 from jsonb_array_elements(l->'spaces')s where s->'levelKnown'='false'::jsonb) then raise exception 'SCENE_MAPPING_INVALID';end if;
 if p_approval and$new$, 1),
  ('public.gp_registry_mapped(uuid,jsonb)'::regprocedure, $old$if (select count(*) from registry_listing_units where listing_id=p_id)<>$old$, $new$if not exists(select 1 from jsonb_array_elements(p_snapshot->'spaces')s where s->'levelKnown' is distinct from 'false'::jsonb) then
   if exists(select 1 from registry_listing_units where listing_id=p_id) or exists(select 1 from canonical_space_claims where listing_id=p_id) or exists(select 1 from registry_published_units where listing_id=p_id) then raise exception 'REGISTRY_LINK_REQUIRED';end if;
   return '[]'::jsonb;
 end if;
 if exists(select 1 from jsonb_array_elements(p_snapshot->'spaces')s where s->'levelKnown'='false'::jsonb) then raise exception 'REGISTRY_LINK_REQUIRED';end if;
 if (select count(*) from registry_listing_units where listing_id=p_id)<>$new$, 1)
 ) as patches(signature, old_fragment, new_fragment, occurrences)
 loop
  before_definition:=pg_get_functiondef(target);
  if (length(before_definition)-length(replace(before_definition,old_text,'')))/length(old_text)<>expected_count then
   raise exception 'UNKNOWN_LEVEL_FUNCTION_SHAPE_CHANGED: %',target;
  end if;
  after_definition:=replace(before_definition,old_text,new_text);
  execute after_definition;
 end loop;
end;
$migration$;
commit;

