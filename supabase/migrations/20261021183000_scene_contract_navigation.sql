-- Runtime format is explicitly gp-parametric-level/1.1, distinct from the planned
-- canonical parking-level schema. Legacy parametric 1.0 remains readable.
begin;
create function public.gp_scene_legacy_geometry(p jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$select p||jsonb_build_object('schemaVersion','1.0','spaces',coalesce((select jsonb_agg(value-'source') from jsonb_array_elements(p->'spaces')),'[]'),'provenance',(p->'provenance')-'geometrySource'-'geometryEvidenceIds','observations',coalesce((select jsonb_agg(value-'id'-'spaceId'-'source'-'observedAt'-'evidenceIds') from jsonb_array_elements(p->'observations')),'[]'))$$;
create function public.gp_validate_scene_metadata(p jsonb,p_evidence uuid[] default null) returns void language plpgsql set search_path=public,pg_temp as $$declare note jsonb;unit jsonb;field text;proof jsonb;ids text[]='{}';begin
 if coalesce(p->>'schemaVersion','') not in ('1.0','gp-parametric-1.1') then raise exception 'SCENE_FORMAT_UNSUPPORTED';end if;
 for field in select jsonb_object_keys(p->'provenance') loop if field not in ('calibrated','accuracyM','controlDistances','observedAt','publicSummary','geometrySource','geometryEvidenceIds') then raise exception 'SCENE_INVALID';end if;end loop;
 if jsonb_typeof(p->'provenance'->'observedAt') is distinct from 'string' or coalesce(p->'provenance'->>'observedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'SCENE_INVALID';end if;
 if p->'provenance' ? 'geometrySource' and coalesce(p->'provenance'->>'geometrySource','') not in ('unknown','plan_derived','measured') then raise exception 'SCENE_INVALID';end if;
 if jsonb_typeof(coalesce(p->'provenance'->'geometryEvidenceIds','[]')) is distinct from 'array' or jsonb_array_length(coalesce(p->'provenance'->'geometryEvidenceIds','[]'))>20 then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
 if (select count(*)<>count(distinct value#>>'{}') from jsonb_array_elements(coalesce(p->'provenance'->'geometryEvidenceIds','[]'))) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
 for proof in select * from jsonb_array_elements(coalesce(p->'provenance'->'geometryEvidenceIds','[]')) loop
  if jsonb_typeof(proof) is distinct from 'string' or coalesce(proof#>>'{}','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (p_evidence is not null and not((proof#>>'{}')::uuid=any(p_evidence))) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
 end loop;
 for unit in select * from jsonb_array_elements(p->'spaces') loop
  if unit ? 'source' and coalesce(unit->>'source','') not in ('unknown','schematic','plan_derived','measured') then raise exception 'SCENE_INVALID';end if;
 end loop;
 for note in select * from jsonb_array_elements(p->'observations') loop
  for field in select jsonb_object_keys(note) loop if field not in ('id','spaceId','source','observedAt','evidenceIds','positionXZ','category','description') then raise exception 'SCENE_INVALID';end if;end loop;
  if note ? 'id' then if coalesce(note->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (note->>'id')=any(ids) then raise exception 'SCENE_INVALID';end if;ids=array_append(ids,note->>'id');end if;
  if note ? 'spaceId' and not exists(select 1 from jsonb_array_elements(p->'spaces')u where u->>'spaceId'=note->>'spaceId') then raise exception 'SCENE_MAPPING_INVALID';end if;
  if note ? 'source' and coalesce(note->>'source','') not in ('unknown','seller_observation','photo_documented','provided_document','measured') then raise exception 'SCENE_INVALID';end if;
  if note->>'observedAt' is not null then if jsonb_typeof(note->'observedAt') is distinct from 'string' or (note->>'observedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' or (note->>'observedAt')::timestamptz>now()+interval '5 minutes' then raise exception 'SCENE_INVALID';end if;end if;
  if jsonb_typeof(coalesce(note->'evidenceIds','[]')) is distinct from 'array' or jsonb_array_length(coalesce(note->'evidenceIds','[]'))>20 then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
  if note->>'source' in ('photo_documented','provided_document') and (note->>'id' is null or note->>'observedAt' is null or jsonb_array_length(coalesce(note->'evidenceIds','[]'))=0) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
  if (select count(*)<>count(distinct value#>>'{}') from jsonb_array_elements(coalesce(note->'evidenceIds','[]'))) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
  for proof in select * from jsonb_array_elements(coalesce(note->'evidenceIds','[]')) loop
   if jsonb_typeof(proof) is distinct from 'string' or coalesce(proof#>>'{}','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (p_evidence is not null and not((proof#>>'{}')::uuid=any(p_evidence))) then raise exception 'SCENE_EVIDENCE_REQUIRED';end if;
  end loop;
 end loop;
end;$$;
alter function public.gp_validate_scene(jsonb) rename to gp_validate_scene_before_contract;
create function public.gp_validate_scene(p jsonb) returns void language plpgsql set search_path=public,pg_temp as $$begin perform gp_validate_scene_metadata(p,null);perform gp_validate_scene_before_contract(gp_scene_legacy_geometry(p));end;$$;
alter function public.gp_scene_create(uuid,jsonb,uuid[],boolean) rename to gp_scene_create_before_contract;
create function public.gp_scene_create(p_listing_id uuid,p_manifest jsonb,p_evidence_ids uuid[],p_rights_attested boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;begin result=gp_scene_create_before_contract(p_listing_id,p_manifest,p_evidence_ids,p_rights_attested);perform gp_validate_scene_metadata(p_manifest,p_evidence_ids);return result;end;$$;
alter function public.gp_scene_review(uuid,integer,text,jsonb,text) rename to gp_scene_review_before_contract;
create function public.gp_scene_review(p_id uuid,p_version integer,p_decision text,p_checks jsonb default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;proof_ids uuid[];begin
 result=gp_scene_review_before_contract(p_id,p_version,p_decision,p_checks,p_reason);
 if p_decision='approve' then if p_checks ? 'observationEvidenceChecked' and jsonb_typeof(p_checks->'observationEvidenceChecked') is distinct from 'boolean' then raise exception 'SCENE_REVIEW_REQUIRED';end if;select evidence_ids into proof_ids from parking_scenes where id=p_id;perform gp_validate_scene_metadata(result->'manifest',proof_ids);end if;return result;end;$$;
alter function public.gp_scene_public(uuid,integer) rename to gp_scene_public_before_contract;
create function public.gp_scene_public(p_listing_id uuid,p_level integer default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;s parking_scenes;l listings;note jsonb;observations jsonb='[]';reviewed_ids jsonb='[]';reviewed_units jsonb='[]';public_note jsonb;unit_alias text;i integer=0;checked boolean;geometry_count integer;source text;begin
 result=gp_scene_public_before_contract(p_listing_id,p_level);if result is null then return null;end if;
 select * into s from parking_scenes where id=(result->>'id')::uuid;select * into l from listings where id=p_listing_id;
 checked=coalesce(s.review_checks->>'observationEvidenceChecked','false')='true';geometry_count=jsonb_array_length(coalesce(s.manifest->'provenance'->'geometryEvidenceIds','[]'));source=coalesce(s.manifest->'provenance'->>'geometrySource','unknown');
 for note in select * from jsonb_array_elements(s.manifest->'observations') loop
  i=i+1;unit_alias=null;
  if note->>'spaceId' is not null then select l.id||':unit:'||u.ordinality into unit_alias from jsonb_array_elements(l.last_published->'spaces') with ordinality u where u.value->>'id'=note->>'spaceId';end if;
  public_note=jsonb_build_object('id',s.id||':observation:'||i,'positionXZ',note->'positionXZ','category',note->'category','description',note->'description','source',coalesce(note->>'source','unknown'),'observedAt',note->'observedAt','evidenceCount',jsonb_array_length(coalesce(note->'evidenceIds','[]')));
  if unit_alias is not null then public_note=public_note||jsonb_build_object('spaceId',unit_alias);end if;
  observations=observations||jsonb_build_array(public_note);
  if checked and note->>'id' is not null and note->>'observedAt' is not null and jsonb_array_length(coalesce(note->'evidenceIds','[]'))>0 and note->>'source' in ('photo_documented','provided_document','measured') then
   reviewed_ids=reviewed_ids||jsonb_build_array(s.id||':observation:'||i);if unit_alias is not null and not(reviewed_units ? unit_alias) then reviewed_units=reviewed_units||jsonb_build_array(unit_alias);end if;
  end if;
 end loop;
 result=jsonb_set(result,'{manifest}',(result->'manifest')||jsonb_build_object('schemaVersion','gp-parametric-1.1','observations',observations,'provenance',(result->'manifest'->'provenance')||jsonb_build_object('geometrySource',source,'geometryEvidenceCount',geometry_count)));
 return result||jsonb_build_object('runtimeContract','gp-parametric-level/1.1','isDemo',coalesce((l.last_published->>'isDemo')::boolean,false),'fidelity',case when source in ('plan_derived','measured') and geometry_count>0 and jsonb_array_length(reviewed_ids)>0 then 'reviewed' else 'measured' end,'documentation',jsonb_build_object('geometrySource',source,'reviewedUnitIds',reviewed_units,'reviewedObservationIds',reviewed_ids,'observationEvidenceChecked',checked,'scope','geometry_and_listed_observations_only'));
end;$$;
revoke all on function public.gp_scene_legacy_geometry(jsonb),public.gp_validate_scene_metadata(jsonb,uuid[]),public.gp_validate_scene_before_contract(jsonb),public.gp_validate_scene(jsonb),public.gp_scene_create_before_contract(uuid,jsonb,uuid[],boolean),public.gp_scene_review_before_contract(uuid,integer,text,jsonb,text),public.gp_scene_public_before_contract(uuid,integer),public.gp_scene_create(uuid,jsonb,uuid[],boolean),public.gp_scene_review(uuid,integer,text,jsonb,text),public.gp_scene_public(uuid,integer) from public,anon,authenticated;
grant execute on function public.gp_scene_create(uuid,jsonb,uuid[],boolean),public.gp_scene_review(uuid,integer,text,jsonb,text) to authenticated;
grant execute on function public.gp_scene_public(uuid,integer) to anon,authenticated;
commit;
