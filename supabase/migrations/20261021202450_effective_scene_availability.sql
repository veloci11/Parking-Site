-- 027: catalog filters, detail flags and the viewer use the same effective 3D availability.
begin;
-- A group is rendered only in its administered common coordinate frame. Do not advertise
-- an individual scene as fallback when that group exists without a renderable common plan.
alter function public.gp_public_parking(uuid,uuid) rename to gp_public_parking_before_effective_scene;
create function public.gp_public_parking(p_alias uuid default null,p_listing_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;ready boolean;items jsonb;begin
 result=gp_public_parking_before_effective_scene(p_alias,p_listing_id);if result is null then return null;end if;
 select exists(select 1 from jsonb_array_elements(result->'levels')lev where lev->'commonPlan' is not null and lev->'commonPlan'<>'null'::jsonb) into ready;
 select coalesce(jsonb_agg(jsonb_set(value,'{sceneAvailable}',to_jsonb(ready))),'[]') into items from jsonb_array_elements(result->'listings');
 return jsonb_set(result,'{listings}',items);
end;$$;
create function public.gp_effective_scene_available(p_listing_id uuid) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare parking jsonb;scene jsonb;proof uuid[];begin
 if not gp_listing_available(p_listing_id) or not exists(select 1 from published_listings where id=p_listing_id and payload->>'locationPrecision'='exact_opt_in') then return false;end if;
 parking=gp_public_parking(null,p_listing_id);
 if parking is not null then return exists(select 1 from jsonb_array_elements(parking->'levels')lev where lev->'commonPlan' is not null and lev->'commonPlan'<>'null'::jsonb);end if;
 scene=gp_scene_public(p_listing_id,null);if scene is null then return false;end if;
 select evidence_ids into proof from parking_scenes where id=(scene->>'id')::uuid and listing_id=p_listing_id;
 return coalesce(cardinality(proof),0)>0 and cardinality(proof)=(select count(*) from parking_scene_sources s where s.id=any(proof) and s.listing_id=p_listing_id and s.processing_state='ready' and exists(select 1 from storage.objects o where o.bucket_id='scene-sources' and o.name=s.object_key));
end;$$;
-- Replace the scene predicate inside the existing materialized filter stage, before
-- matching/count/keyset/LIMIT. Preserve every transaction, spatial and mixed-lot rule.
do $$declare definition text;changed text;needle text='gp_scene_public(id,null) is not null scene_ready';begin
 select pg_get_functiondef('public.gp_catalog_page_v2(jsonb,jsonb,integer)'::regprocedure) into definition;
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'CATALOG_SCENE_SHAPE';end if;
 changed=replace(definition,needle,'gp_effective_scene_available(id) scene_ready');
 execute changed;
end;$$;
revoke all on function public.gp_public_parking_before_effective_scene(uuid,uuid),public.gp_public_parking(uuid,uuid),public.gp_effective_scene_available(uuid) from public,anon,authenticated;
grant execute on function public.gp_public_parking(uuid,uuid),public.gp_effective_scene_available(uuid) to anon,authenticated;
commit;
