-- Rollback-only contract QA. Inert private source metadata, no Storage API write,
-- no email delivery and no fixture persists. Requires migrations003/013/015.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('fd150000-0000-4000-8000-000000000001','{"name":"Scene owner rollback"}',now()),
('fd150000-0000-4000-8000-000000000002','{"name":"Scene reviewer rollback"}',now());
update app_roles set role='moderator' where user_id='fd150000-0000-4000-8000-000000000002';
insert into listings(id,seller_id,draft,lifecycle_state,last_published) values('fd150001-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','{"id":"fd150001-0000-4000-8000-000000000001","isDemo":true,"locationPrecision":"exact_opt_in","spaces":[{"id":"fd150002-0000-4000-8000-000000000001","number":"QA-15","level":-1,"lengthM":5,"widthM":2.4,"clearanceM":2.1,"areaM2":12}]}','pending',null);
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256) values('fd150003-0000-4000-8000-000000000001','fd150001-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001/fd150001-0000-4000-8000-000000000001/fd150003-0000-4000-8000-000000000001.pdf','application/pdf',100,repeat('a',64));
-- Only metadata inside this rolled-back transaction; no physical object is created.
insert into storage.objects(bucket_id,name) values('scene-sources','fd150000-0000-4000-8000-000000000001/fd150001-0000-4000-8000-000000000001/fd150003-0000-4000-8000-000000000001.pdf');
select set_config('gp.qa.manifest',jsonb_build_object('schemaVersion','gp-parametric-1.1','unit','m','upAxis','Y','level',-1,'floor','{"footprintXZ":[[0,0],[10,0],[10,10],[0,10]],"thicknessM":0.2}'::jsonb,'spaces','[{"spaceId":"fd150002-0000-4000-8000-000000000001","displayNumber":"QA-15","footprintXZ":[[1,1],[3.4,1],[3.4,6],[1,6]],"dimensions":{"lengthM":5,"widthM":2.4,"clearanceM":2.1},"source":"plan_derived"}]'::jsonb,'contextSpaces','[]'::jsonb,'obstacles','[]'::jsonb,'provenance',jsonb_build_object('calibrated',true,'accuracyM',.05,'controlDistances','[{"fromXZ":[0,0],"toXZ":[10,0],"measuredM":10},{"fromXZ":[0,0],"toXZ":[0,10],"measuredM":10}]'::jsonb,'observedAt','2026-01-01T00:00:00Z','publicSummary','Fixture technique fictive, aucun parking réel.','geometrySource','plan_derived','geometryEvidenceIds','["fd150003-0000-4000-8000-000000000001"]'::jsonb),'observations','[{"id":"fd150004-0000-4000-8000-000000000001","spaceId":"fd150002-0000-4000-8000-000000000001","source":"provided_document","observedAt":"2026-01-01T00:00:00Z","evidenceIds":["fd150003-0000-4000-8000-000000000001"],"positionXZ":[1,1],"category":"floor","description":"Observation fictive de recette du contrat."}]'::jsonb)::text,true);
select set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fd150000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',true);
select set_config('gp.qa.scene_contract',(gp_scene_create('fd150001-0000-4000-8000-000000000001',current_setting('gp.qa.manifest')::jsonb,array['fd150003-0000-4000-8000-000000000001'::uuid],true)->>'id'),true);
do $$declare bad jsonb;begin
 bad=jsonb_set(current_setting('gp.qa.manifest')::jsonb,'{provenance,geometryEvidenceIds}','[null]');
 begin perform gp_validate_scene_metadata(bad,array['fd150003-0000-4000-8000-000000000001'::uuid]);raise exception 'Null proof accepted';exception when others then if sqlerrm<>'SCENE_EVIDENCE_REQUIRED' then raise;end if;end;
 bad=jsonb_set(current_setting('gp.qa.manifest')::jsonb,'{observations,0,observedAt}','"today"');
 begin perform gp_validate_scene_metadata(bad,null);raise exception 'Non ISO date accepted';exception when others then if sqlerrm<>'SCENE_INVALID' then raise;end if;end;
 bad=jsonb_set(current_setting('gp.qa.manifest')::jsonb,'{observations,0,evidenceIds}','["fd150003-0000-4000-8000-000000000099"]');
 begin perform gp_validate_scene_metadata(bad,array['fd150003-0000-4000-8000-000000000001'::uuid]);raise exception 'Foreign evidence accepted';exception when others then if sqlerrm<>'SCENE_EVIDENCE_REQUIRED' then raise;end if;end;
 if has_function_privilege('authenticated','gp_scene_create_before_contract(uuid,jsonb,uuid[],boolean)','EXECUTE') or has_function_privilege('anon','gp_scene_public_before_contract(uuid,integer)','EXECUTE') then raise exception 'Core RPC bypass';end if;
end;$$;
select set_config('request.jwt.claim.sub','fd150000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"fd150000-0000-4000-8000-000000000002","aal":"aal2","role":"authenticated"}',true);
insert into published_listings(id,payload) select id,draft from listings where id='fd150001-0000-4000-8000-000000000001';
update listings set lifecycle_state='published',last_published=draft where id='fd150001-0000-4000-8000-000000000001';
select gp_scene_review(current_setting('gp.qa.scene_contract')::uuid,1,'approve','{"geometryMatchesSources":true,"numbersAndLevelChecked":true,"conditionMatchesPhotos":true,"locationConsentChecked":true,"observationEvidenceChecked":true}',null);
set local role anon;
do $$declare value jsonb;begin value=gp_scene_public('fd150001-0000-4000-8000-000000000001',-1);
 if value->>'runtimeContract'<>'gp-parametric-level/1.1' or value->>'fidelity'<>'reviewed' or value->'manifest'->>'schemaVersion'<>'gp-parametric-1.1' or value->'documentation'->>'scope'<>'geometry_and_listed_observations_only' then raise exception 'Version or scoped review projection failed';end if;
 if value::text like '%fd150003-%' or value::text like '%fd150004-%' or value::text like '%fd150002-%' or value::text like '%evidenceIds%' then raise exception 'Private source identity leaked';end if;
 if value->'manifest'->'observations'->0->>'evidenceCount'<>'1' then raise exception 'Evidence summary missing';end if;
end;$$;
reset role;
rollback;
