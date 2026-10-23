-- 026: one explicitly reviewed coordinate frame per canonical parking level.
-- Individual listing scenes are never geometrically merged.
begin;
create table public.parking_level_plans(
 level_id uuid primary key references public.parking_levels(id),public_alias uuid not null unique default gen_random_uuid(),
 manifest jsonb not null,evidence_ids uuid[] not null,state text not null check(state in ('published','withdrawn')),
 row_version integer not null check(row_version>0),reviewer_id uuid not null references auth.users(id),
 reason text not null check(char_length(btrim(reason)) between 15 and 2000),reviewed_at timestamptz not null default now()
);
alter table public.parking_level_plans enable row level security;
revoke all on public.parking_level_plans from public,anon,authenticated;
grant all on public.parking_level_plans to service_role;

create function public.gp_common_plan_sources_ready(p_level uuid,p_ids uuid[]) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select cardinality(p_ids) between 1 and 20 and cardinality(p_ids)=(select count(distinct s.id) from parking_scene_sources s
where s.id=any(p_ids) and s.processing_state='ready'
and exists(select 1 from storage.objects o where o.bucket_id='scene-sources' and o.name=s.object_key)
and exists(select 1 from registry_listing_units u join parking_spaces sp on sp.id=u.space_id join parking_levels lev on lev.id=sp.level_id
join parking_levels target on target.id=p_level where u.listing_id=s.listing_id and lev.site_id=target.site_id))$$;

create function public.gp_common_rect_overlap(p jsonb,q jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare ring jsonb;i integer;axis_x numeric;axis_z numeric;pmin numeric;pmax numeric;qmin numeric;qmax numeric;begin
 foreach ring in array array[p,q] loop for i in 0..3 loop
 axis_x=-((ring->((i+1)%4)->>1)::numeric-(ring->i->>1)::numeric);axis_z=(ring->((i+1)%4)->>0)::numeric-(ring->i->>0)::numeric;
 select min((value->>0)::numeric*axis_x+(value->>1)::numeric*axis_z),max((value->>0)::numeric*axis_x+(value->>1)::numeric*axis_z) into pmin,pmax from jsonb_array_elements(p);
 select min((value->>0)::numeric*axis_x+(value->>1)::numeric*axis_z),max((value->>0)::numeric*axis_x+(value->>1)::numeric*axis_z) into qmin,qmax from jsonb_array_elements(q);
 if least(pmax,qmax)-greatest(pmin,qmin)<=0.0001 then return false;end if;
 end loop;end loop;return true;
end;$$;
create function public.gp_common_plan_geometry(p_level uuid,p_manifest jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare u jsonb;ref parking_spaces;field text;points jsonb;edge_lengths numeric[];expected numeric[];i integer;area numeric;begin
 perform gp_validate_scene(p_manifest);
 if (p_manifest->>'level')::integer is distinct from (select number from parking_levels where id=p_level)
 or jsonb_array_length(p_manifest->'spaces')<>(select count(*) from parking_spaces where level_id=p_level)
 or p_manifest->'provenance'->>'calibrated' is distinct from 'true'
 or coalesce(p_manifest->'provenance'->>'geometrySource','') not in ('plan_derived','measured')
 or jsonb_array_length(coalesce(p_manifest->'provenance'->'geometryEvidenceIds','[]'))=0
 or jsonb_array_length(p_manifest->'observations')<>0 then raise exception 'COMMON_PLAN_INVALID';end if;
 for u in select * from jsonb_array_elements(p_manifest->'spaces') loop
 select * into ref from parking_spaces where id=(u->>'spaceId')::uuid and level_id=p_level;
 if not found then raise exception 'COMMON_PLAN_INVALID';end if;
 foreach field in array array['lengthM','widthM','clearanceM'] loop
 if ref.dimensions->>field is null or u->'dimensions'->>field is null or abs((ref.dimensions->>field)::numeric-(u->'dimensions'->>field)::numeric)>0.05 then raise exception 'COMMON_PLAN_INVALID';end if;end loop;
 points=u->'footprintXZ';if jsonb_array_length(points)<>4 then raise exception 'COMMON_PLAN_INVALID';end if;
 edge_lengths='{}';for i in 0..3 loop edge_lengths=array_append(edge_lengths,sqrt(power((points->i->>0)::numeric-(points->((i+1)%4)->>0)::numeric,2)+power((points->i->>1)::numeric-(points->((i+1)%4)->>1)::numeric,2)));end loop;
 select array_agg(n order by n) into edge_lengths from unnest(edge_lengths)n;
 select array_agg(n order by n) into expected from unnest(array[(ref.dimensions->>'lengthM')::numeric,(ref.dimensions->>'lengthM')::numeric,(ref.dimensions->>'widthM')::numeric,(ref.dimensions->>'widthM')::numeric])n;
 for i in 1..4 loop if abs(edge_lengths[i]-expected[i])>0.05 then raise exception 'COMMON_PLAN_INVALID';end if;end loop;
 area=0;for i in 0..3 loop area=area+(points->i->>0)::numeric*(points->((i+1)%4)->>1)::numeric-(points->i->>1)::numeric*(points->((i+1)%4)->>0)::numeric;end loop;
 if abs(abs(area)/2-(ref.dimensions->>'lengthM')::numeric*(ref.dimensions->>'widthM')::numeric)>0.1 then raise exception 'COMMON_PLAN_INVALID';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_manifest->'spaces')with ordinality a cross join jsonb_array_elements(p_manifest->'spaces')with ordinality b where a.ordinality<b.ordinality and gp_common_rect_overlap(a.value->'footprintXZ',b.value->'footprintXZ')) then raise exception 'COMMON_PLAN_INVALID';end if;
end;$$;

alter function public.gp_registry_command(jsonb) rename to gp_registry_command_before_common_plans;
create function public.gp_registry_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text=p_command->>'action';lev parking_levels;old parking_level_plans;expected integer;proof uuid[];field text;begin
 if not gp_admin_allowed() or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'MFA_OR_PERMISSION_REQUIRED';end if;
 if action not in ('publish_level_plan','withdraw_level_plan') or action is null then return gp_registry_command_before_common_plans(p_command);end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'COMMON_PLAN_INVALID';end if;
 for field in select jsonb_object_keys(p_command) loop if field not in ('action','levelId','version','reason') and (action<>'publish_level_plan' or field not in ('manifest','evidenceIds','rightsAttested','checks')) then raise exception 'COMMON_PLAN_INVALID';end if;end loop;
 if coalesce(p_command->>'levelId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_command->'version') is distinct from 'number' or (p_command->>'version')::numeric<0 or (p_command->>'version')::numeric>2147483646 or trunc((p_command->>'version')::numeric)<>(p_command->>'version')::numeric
 or jsonb_typeof(p_command->'reason') is distinct from 'string' or char_length(btrim(p_command->>'reason')) not between 15 and 2000 then raise exception 'COMMON_PLAN_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('gp:canonical-registry',0));
 select * into lev from parking_levels where id=(p_command->>'levelId')::uuid for update;if not found then raise exception 'NOT_FOUND';end if;
 select * into old from parking_level_plans where level_id=lev.id for update;
 expected=(p_command->>'version')::integer;if coalesce(old.row_version,0)<>expected then raise exception 'VERSION_CONFLICT';end if;
 if action='withdraw_level_plan' then
 if old.level_id is null then raise exception 'NOT_FOUND';end if;
 update parking_level_plans set state='withdrawn',row_version=row_version+1,reviewer_id=auth.uid(),reason=btrim(p_command->>'reason'),reviewed_at=now() where level_id=lev.id;
 else
 if p_command->'rightsAttested' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'checks') is distinct from 'object'
 or p_command->'checks' is distinct from '{"coordinateFrameConfirmed":true,"mappingChecked":true,"sourcesChecked":true}'::jsonb
 or jsonb_typeof(p_command->'evidenceIds') is distinct from 'array' or jsonb_array_length(p_command->'evidenceIds') not between 1 and 20 then raise exception 'COMMON_PLAN_INVALID';end if;
 for field in select jsonb_array_elements_text(p_command->'evidenceIds') loop if field!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'COMMON_PLAN_INVALID';end if;end loop;
 select array_agg(value::uuid) into proof from jsonb_array_elements_text(p_command->'evidenceIds');
 if not coalesce(gp_common_plan_sources_ready(lev.id,proof),false) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
 perform gp_common_plan_geometry(lev.id,p_command->'manifest');
 if exists(select 1 from jsonb_array_elements_text(p_command->'manifest'->'provenance'->'geometryEvidenceIds') where not(value::uuid=any(proof))) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
 insert into parking_level_plans(level_id,manifest,evidence_ids,state,row_version,reviewer_id,reason) values(lev.id,p_command->'manifest',proof,'published',expected+1,auth.uid(),btrim(p_command->>'reason'))
 on conflict(level_id) do update set manifest=excluded.manifest,evidence_ids=excluded.evidence_ids,state=excluded.state,row_version=excluded.row_version,reviewer_id=excluded.reviewer_id,reason=excluded.reason,reviewed_at=now();
 end if;
 insert into audit_events(actor_id,action,target_id,detail) values(auth.uid(),'registry.'||action,lev.id::text,btrim(p_command->>'reason'));
 return jsonb_build_object('status','saved','id',lev.id,'version',expected+1);
end;$$;

create function public.gp_public_common_plan(p_level uuid,p_parking_alias uuid,p_spaces jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare plan parking_level_plans;u jsonb;ref parking_spaces;unit jsonb;geometry jsonb;spaces jsonb='[]';field text;begin
 select * into plan from parking_level_plans where level_id=p_level and state='published';if not found then return null;end if;
 if not coalesce(gp_common_plan_sources_ready(p_level,plan.evidence_ids),false) then return null;end if;
 begin perform gp_common_plan_geometry(p_level,plan.manifest);exception when others then return null;end;
 for u in select * from jsonb_array_elements(p_spaces) loop
 select * into ref from parking_spaces where level_id=p_level and public_alias=(u->>'id')::uuid;
 select value into geometry from jsonb_array_elements(plan.manifest->'spaces') where value->>'spaceId'=ref.id::text;
 select s.value into unit from published_listings p cross join lateral jsonb_array_elements(p.payload->'spaces')s where p.id=(u->>'listingId')::uuid and p.payload->>'locationPrecision'='exact_opt_in' and gp_listing_available(p.id) and s.value->>'id'=u->>'listingUnitId';
 if geometry is null or unit is null then return null;end if;
 foreach field in array array['lengthM','widthM','clearanceM'] loop if unit->>field is null or abs((unit->>field)::numeric-(geometry->'dimensions'->>field)::numeric)>0.05 then return null;end if;end loop;
 spaces=spaces||jsonb_build_array(jsonb_build_object('id',u->'id','displayNumber',coalesce(nullif(u->>'number',''),'Place'),'footprintXZ',geometry->'footprintXZ','dimensions',geometry->'dimensions','source',coalesce(geometry->>'source','plan_derived')));
 end loop;
 if jsonb_array_length(spaces)=0 then return null;end if;
 return jsonb_build_object('id',plan.public_alias,'parkingId',p_parking_alias,'version',plan.row_version,'fidelity','measured','reviewedAt',plan.reviewed_at,'isDemo',false,
 'manifest',jsonb_build_object('schemaVersion','gp-parametric-1.1','unit','m','upAxis','Y','level',plan.manifest->'level','floor',plan.manifest->'floor','spaces',spaces,'contextSpaces',plan.manifest->'contextSpaces','obstacles',plan.manifest->'obstacles','observations','[]'::jsonb,
 'provenance',jsonb_build_object('calibrated',true,'accuracyM',plan.manifest->'provenance'->'accuracyM','controlDistancesCount',jsonb_array_length(plan.manifest->'provenance'->'controlDistances'),'observedAt',plan.manifest->'provenance'->'observedAt','publicSummary',plan.manifest->'provenance'->'publicSummary','geometrySource',plan.manifest->'provenance'->'geometrySource','geometryEvidenceCount',cardinality(plan.evidence_ids))));
end;$$;
alter function public.gp_public_parking(uuid,uuid) rename to gp_public_parking_before_common_plans;
create function public.gp_public_parking(p_alias uuid default null,p_listing_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;levels jsonb='[]';lev jsonb;physical uuid;begin
 result=gp_public_parking_before_common_plans(p_alias,p_listing_id);if result is null then return null;end if;
 for lev in select * from jsonb_array_elements(result->'levels') loop
 select id into physical from parking_levels where public_alias=(lev->>'id')::uuid;
 levels=levels||jsonb_build_array(lev||jsonb_build_object('commonPlan',gp_public_common_plan(physical,(result->>'id')::uuid,lev->'spaces')));
 end loop;return jsonb_set(result,'{levels}',levels);
end;$$;
alter function public.gp_admin_parking_registry(uuid) rename to gp_admin_parking_registry_before_common_plans;
create function public.gp_admin_parking_registry(p_listing_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;sites jsonb='[]';s jsonb;levels jsonb;lev jsonb;plan parking_level_plans;begin
 result=gp_admin_parking_registry_before_common_plans(p_listing_id);
 for s in select * from jsonb_array_elements(result->'sites') loop
 levels='[]';for lev in select * from jsonb_array_elements(s->'levels') loop
 select * into plan from parking_level_plans where level_id=(lev->>'id')::uuid;
 levels=levels||jsonb_build_array(lev||jsonb_strip_nulls(jsonb_build_object('planVersion',coalesce(plan.row_version,0),'planState',plan.state)));
 end loop;sites=sites||jsonb_build_array(jsonb_set(s,'{levels}',levels));end loop;return jsonb_set(result,'{sites}',sites);
end;$$;
-- Active common geometry retains its private evidence, before the bounded candidate limit.
create or replace function public.gp_orphan_scene_source_candidates(p_limit integer default 100) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(id),'[]') from(select s.id from parking_scene_sources s where s.created_at<now()-interval '7 days' and not exists(select 1 from parking_scenes p where s.id=any(p.evidence_ids)) and not exists(select 1 from parking_level_plans p where p.state='published' and s.id=any(p.evidence_ids)) and not exists(select 1 from listings l where position(s.id::text in l.draft::text)>0 or position(s.id::text in coalesce(l.last_published::text,''))>0) and not exists(select 1 from listing_revisions r where position(s.id::text in r.payload::text)>0) order by s.id limit least(100,greatest(1,p_limit)))q$$;
revoke all on function public.gp_common_plan_sources_ready(uuid,uuid[]),public.gp_common_rect_overlap(jsonb,jsonb),public.gp_common_plan_geometry(uuid,jsonb),public.gp_registry_command_before_common_plans(jsonb),public.gp_public_common_plan(uuid,uuid,jsonb),public.gp_public_parking_before_common_plans(uuid,uuid),public.gp_admin_parking_registry_before_common_plans(uuid),public.gp_registry_command(jsonb),public.gp_public_parking(uuid,uuid),public.gp_admin_parking_registry(uuid) from public,anon,authenticated;
grant execute on function public.gp_registry_command(jsonb),public.gp_admin_parking_registry(uuid) to authenticated;
grant execute on function public.gp_public_parking(uuid,uuid) to anon,authenticated;
commit;
