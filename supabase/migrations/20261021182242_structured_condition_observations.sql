-- 014: observations attributed by the server; evidence stays private until approval.
begin;
create function public.gp_attribute_conditions(p_inputs jsonb,p_listing jsonb,p_id uuid,p_previous jsonb default '[]',p_require_evidence boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb='[]';item jsonb;field text;sid text;media_id text;doc_id text;value jsonb;prior jsonb;ids text[]='{}';scopes text[]='{}';scope_key text;photos jsonb;begin
 if jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs)>4509 then raise exception 'CONDITION_INVALID';end if;
 for item in select * from jsonb_array_elements(p_inputs) loop
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'CONDITION_INVALID';end if;
 for field in select jsonb_object_keys(item) loop if field not in ('id','spaceId','category','value','comment','sourceKind','observedAt','evidenceMediaIds','sourceDocumentIds') then raise exception 'CONDITION_INVALID';end if;end loop;
 if coalesce(item->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or not(item ? 'spaceId') or not(item ? 'observedAt') or coalesce(item->>'category','') not in ('floor','walls_ceiling','humidity','lighting','markings_cleanliness','maneuver','clearance_access','security','space') or jsonb_typeof(item->'value') is distinct from 'string' or length(item->>'value')>1000 or (item ? 'comment' and (jsonb_typeof(item->'comment') is distinct from 'string' or length(item->>'comment')>2000)) or coalesce(item->>'sourceKind','') not in ('seller_declared','photo_documented','measured','plan_derived') then raise exception 'CONDITION_INVALID';end if;
 sid=item->>'spaceId';if sid is not null and (jsonb_typeof(item->'spaceId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(p_listing->'spaces') s where s.value->>'id'=sid)) then raise exception 'CONDITION_SCOPE_INVALID';end if;
 scope_key=coalesce(sid,'common')||':'||(item->>'category');if item->>'id'=any(ids) or scope_key=any(scopes) then raise exception 'CONDITION_DUPLICATE';end if;ids=array_append(ids,item->>'id');scopes=array_append(scopes,scope_key);
 if item->'observedAt'<>'null'::jsonb then if jsonb_typeof(item->'observedAt') is distinct from 'string' or item->>'observedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or (item->>'observedAt')::timestamptz>now()+interval '5 minutes' then raise exception 'CONDITION_INVALID';end if;end if;
 if jsonb_typeof(item->'evidenceMediaIds') is distinct from 'array' or jsonb_array_length(item->'evidenceMediaIds')>12 or (item ? 'sourceDocumentIds' and (jsonb_typeof(item->'sourceDocumentIds') is distinct from 'array' or jsonb_array_length(item->'sourceDocumentIds')>10)) then raise exception 'CONDITION_INVALID';end if;
 if sid is null then select coalesce(jsonb_agg(photo),'[]') into photos from gp_all_photo_urls(p_listing)photo;else photos=coalesce(p_listing->'spacePhotos'->sid,'[]');end if;
 for value in select * from jsonb_array_elements(item->'evidenceMediaIds') loop
 media_id=value#>>'{}';if jsonb_typeof(value) is distinct from 'string' or not(photos ? ('/api/media/'||media_id)) or not exists(select 1 from media_assets where id::text=media_id and owner_id=auth.uid() and listing_id=p_id) then raise exception 'CONDITION_MEDIA_NOT_OWNED';end if;
 end loop;
 for value in select * from jsonb_array_elements(coalesce(item->'sourceDocumentIds','[]')) loop
 doc_id=value#>>'{}';if jsonb_typeof(value) is distinct from 'string' or not exists(select 1 from parking_scene_sources where id::text=doc_id and listing_id=p_id and owner_id=auth.uid()) then raise exception 'CONDITION_DOCUMENT_NOT_OWNED';end if;
 end loop;
 if p_require_evidence and length(btrim(item->>'value'))>0 and ((item->>'sourceKind'='photo_documented' and jsonb_array_length(item->'evidenceMediaIds')=0) or (item->>'sourceKind'='plan_derived' and jsonb_array_length(coalesce(item->'sourceDocumentIds','[]'))=0)) then raise exception 'CONDITION_EVIDENCE_REQUIRED';end if;
 item=item||jsonb_build_object('value',btrim(item->>'value'),'comment',btrim(coalesce(item->>'comment','')));
 select p into prior from jsonb_array_elements(p_previous)p where p->>'id'=item->>'id';
 result=result||jsonb_build_array(item||jsonb_build_object('observerId',case when (prior-'observerId'-'confidenceScope')=item then coalesce(prior->>'observerId',auth.uid()::text) else auth.uid()::text end,'confidenceScope',case when sid is null then 'common_declared' else 'unit_declared' end));
 end loop;return result;end;$$;
alter function public.gp_validate_draft(jsonb,uuid,boolean) rename to gp_validate_draft_before_conditions;
create function public.gp_validate_draft(p jsonb,p_id uuid,p_submit boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare editable jsonb;begin
 perform gp_validate_draft_before_conditions(p-'conditionObservations',p_id,p_submit);
 if p ? 'conditionObservations' then
 if jsonb_typeof(p->'conditionObservations') is distinct from 'array' then raise exception 'CONDITION_INVALID';end if;
 select coalesce(jsonb_agg(value-'observerId'-'confidenceScope'),'[]') into editable from jsonb_array_elements(p->'conditionObservations');
 perform gp_attribute_conditions(editable,p,p_id,p->'conditionObservations',p_submit);end if;end;$$;
alter function public.gp_listing(uuid,text,jsonb,integer) rename to gp_listing_before_conditions;
create function public.gp_listing(p_id uuid,p_action text,p_payload jsonb default '{}',p_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l listings;conditions jsonb;result jsonb;begin
 if not gp_active() then raise exception 'UNAUTHENTICATED';end if;
 if p_payload ? 'conditionObservations' and coalesce(p_action,'') not in ('create','update') then raise exception 'CONDITION_INVALID';end if;
 if p_action='update' and p_payload ? 'conditionObservations' then
 select * into l from listings where id=p_id for update;if not found or l.seller_id<>auth.uid() then raise exception 'NOT_FOUND';end if;
 if p_version is null or l.row_version<>p_version then raise exception 'VERSION_CONFLICT';end if;
 conditions=gp_attribute_conditions(p_payload->'conditionObservations',l.draft||p_payload,p_id,coalesce(l.draft->'conditionObservations','[]'));
 -- Internal staging remains in this transaction; the existing mutation performs all version/state/ownership checks.
 update listings set draft=jsonb_set(draft,'{conditionObservations}',conditions) where id=p_id;
 end if;
 result=gp_listing_before_conditions(p_id,p_action,p_payload-'conditionObservations',p_version);
 if p_action='create' and p_payload ? 'conditionObservations' then
 conditions=gp_attribute_conditions(p_payload->'conditionObservations',result,p_id,'[]');result=result||jsonb_build_object('conditionObservations',conditions);
 perform gp_validate_draft(result,p_id,false);update listings set draft=result where id=p_id;
 end if;return result;end;$$;
alter function public.gp_public_payload(jsonb) rename to gp_public_payload_before_conditions;
create function public.gp_public_payload(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$declare result jsonb;conditions jsonb;begin
 result=gp_public_payload_before_conditions(p);
 select coalesce(jsonb_agg(jsonb_build_object('id',(p->>'id')||':observation:'||o.ordinality,'spaceId',case when o.value->>'spaceId' is null then null else (p->>'id')||':unit:'||(select s.ordinality from jsonb_array_elements(p->'spaces') with ordinality s where s.value->>'id'=o.value->>'spaceId') end,'category',o.value->'category','value',o.value->'value','comment',o.value->'comment','sourceKind',o.value->'sourceKind','observedAt',o.value->'observedAt','evidenceMediaIds',(select coalesce(jsonb_agg(e.value),'[]') from jsonb_array_elements(o.value->'evidenceMediaIds')e where exists(select 1 from gp_all_photo_urls(p)photo where photo='/api/media/'||(e.value#>>'{}'))),'confidenceScope',case when o.value->>'spaceId' is null then 'common_declared' else 'unit_declared' end) order by o.ordinality),'[]') into conditions from jsonb_array_elements(coalesce(p->'conditionObservations','[]')) with ordinality o where o.value->>'spaceId' is null or exists(select 1 from jsonb_array_elements(p->'spaces')s where s->>'id'=o.value->>'spaceId');
 return result||jsonb_build_object('conditionObservations',conditions);end;$$;
-- Dry-run only: a referenced private source is never advertised as an orphan candidate.
create function public.gp_orphan_scene_source_candidates(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(id),'[]') from(select s.id from parking_scene_sources s where s.created_at<now()-interval '7 days' and not exists(select 1 from parking_scenes p where s.id=any(p.evidence_ids)) and not exists(select 1 from listings l where position(s.id::text in l.draft::text)>0 or position(s.id::text in coalesce(l.last_published::text,''))>0) and not exists(select 1 from listing_revisions r where position(s.id::text in r.payload::text)>0) order by s.id limit least(100,greatest(1,p_limit)))q$$;
alter function public.gp_maintenance_plan(integer) rename to gp_maintenance_plan_before_conditions;
create function public.gp_maintenance_plan(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_set(gp_maintenance_plan_before_conditions(p_limit),'{retentionCandidates,orphanSceneSources7d}',gp_orphan_scene_source_candidates(p_limit),true)$$;
revoke all on function public.gp_attribute_conditions(jsonb,jsonb,uuid,jsonb,boolean),public.gp_validate_draft_before_conditions(jsonb,uuid,boolean),public.gp_validate_draft(jsonb,uuid,boolean),public.gp_listing_before_conditions(uuid,text,jsonb,integer),public.gp_listing(uuid,text,jsonb,integer),public.gp_public_payload_before_conditions(jsonb),public.gp_public_payload(jsonb),public.gp_orphan_scene_source_candidates(integer),public.gp_maintenance_plan_before_conditions(integer),public.gp_maintenance_plan(integer) from public,anon,authenticated;
grant execute on function public.gp_listing(uuid,text,jsonb,integer) to authenticated;
grant execute on function public.gp_maintenance_plan(integer) to service_role;
commit;
