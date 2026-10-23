-- 026: controlled canonical parking/geometry fixtures only. No Auth calls, email or asset upload.
-- Storage rows represent already processed inert fixture bytes; the whole transaction rolls back.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f2610000-0000-4000-8000-000000000001','{"name":"Common Seller QA"}',now()),
('f2610000-0000-4000-8000-000000000002','{"name":"Common Admin QA"}',now()),
('f2610000-0000-4000-8000-000000000003','{"name":"Common Moderator QA"}',now());
update app_roles set role=case when user_id='f2610000-0000-4000-8000-000000000002' then 'admin' else 'moderator' end where user_id in('f2610000-0000-4000-8000-000000000002','f2610000-0000-4000-8000-000000000003');
insert into parking_sites(id,public_name,internal_reference) values('f2620000-0000-4000-8000-000000000001','Parking partagé de recette','PRIVATE-SITE');
insert into parking_levels(id,site_id,code,label,number,sort_order) values
('f2630000-0000-4000-8000-000000000001','f2620000-0000-4000-8000-000000000001','SS1','Sous-sol 1',-1,0),
('f2630000-0000-4000-8000-000000000002','f2620000-0000-4000-8000-000000000001','SS2','Sous-sol 2',-2,1);
insert into parking_spaces(id,level_id,number,private_lot_reference,dimensions)
select ('f2640000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=3 then 'f2630000-0000-4000-8000-000000000002' else 'f2630000-0000-4000-8000-000000000001' end::uuid,'PRIVATE-CANONICAL-NUMBER','PRIVATE-LOT','{"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1}' from generate_series(1,4)n;
insert into listings(id,seller_id,draft,last_published,lifecycle_state,availability_confirmed_at,availability_expires_at)
select ('f2650000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f2610000-0000-4000-8000-000000000001',p,p,'published',now(),now()+interval '90 days' from generate_series(1,3)n cross join lateral(select jsonb_build_object('id','f2650000-0000-4000-8000-'||lpad(n::text,12,'0'),'slug','common-qa','title','Place partagée de recette','description',repeat('Description factuelle. ',10),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',2000000,'type','covered','spaces',case when n=2 then '[{"id":"f2660000-0000-4000-8000-000000000002","number":"13","level":-1,"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1},{"id":"f2660000-0000-4000-8000-000000000003","number":"24","level":-2,"areaM2":12,"lengthM":5,"widthM":2.4,"clearanceM":2.1}]'::jsonb else jsonb_build_array(jsonb_build_object('id',case when n=1 then 'f2660000-0000-4000-8000-000000000001' else 'f2660000-0000-4000-8000-000000000004' end,'number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)) end,'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":""}'::jsonb,'locationPrecision',case when n=3 then 'area' else 'exact_opt_in' end,'coordinates','[2.3739,48.8446]'::jsonb,'sceneAvailable',false,'isDemo',false,'status','published','version',1,'sellerName','QA','createdAt',now(),'updatedAt',now())p)q;
insert into published_listings(id,payload) select id,gp_public_payload(draft) from listings where id::text like 'f2650000-%';
insert into registry_listing_units(listing_id,unit_id,space_id,signature)
select id,(u.value->>'id')::uuid,replace(u.value->>'id','f2660000','f2640000')::uuid,md5((draft->'spaces')::text) from listings cross join lateral jsonb_array_elements(draft->'spaces')u where id::text like 'f2650000-%';
insert into registry_published_units select listing_id,unit_id,space_id from registry_listing_units where listing_id::text like 'f2650000-%';
insert into canonical_space_claims select space_id,listing_id from registry_published_units where listing_id::text like 'f2650000-%';
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256) values('f2670000-0000-4000-8000-000000000001','f2650000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001','f2610000-0000-4000-8000-000000000001/f2650000-0000-4000-8000-000000000001/f2670000-0000-4000-8000-000000000001.pdf','application/pdf',100,repeat('a',64));
insert into storage.objects(id,bucket_id,name,metadata) values('f2670000-0000-4000-8000-000000000001','scene-sources','f2610000-0000-4000-8000-000000000001/f2650000-0000-4000-8000-000000000001/f2670000-0000-4000-8000-000000000001.pdf','{"size":100}');
update parking_scene_sources set processing_state='ready',page_count=1,processor_version='gp-source-raster/1',processed_at=now() where id='f2670000-0000-4000-8000-000000000001';
select set_config('gp.qa.common_command',jsonb_build_object('action','publish_level_plan','levelId','f2630000-0000-4000-8000-000000000001','version',0,'rightsAttested',true,'checks','{"coordinateFrameConfirmed":true,"mappingChecked":true,"sourcesChecked":true}'::jsonb,'reason','Sources, repère unique et dimensions rapprochés.','evidenceIds','["f2670000-0000-4000-8000-000000000001"]'::jsonb,'manifest',jsonb_build_object('schemaVersion','gp-parametric-1.1','unit','m','upAxis','Y','level',-1,'floor','{"footprintXZ":[[0,0],[20,0],[20,15],[0,15]],"thicknessM":0.2}'::jsonb,'spaces',(select jsonb_agg(jsonb_build_object('spaceId',id,'displayNumber','PRIVATE-CANONICAL-NUMBER','footprintXZ',jsonb_build_array(jsonb_build_array(x,1),jsonb_build_array(x+2.4,1),jsonb_build_array(x+2.4,6),jsonb_build_array(x,6)),'dimensions','{"lengthM":5,"widthM":2.4,"clearanceM":2.1}'::jsonb,'source','plan_derived') order by id) from(select id,1+4*(row_number()over(order by id)-1) as x from parking_spaces where level_id='f2630000-0000-4000-8000-000000000001')s),'contextSpaces','[]'::jsonb,'obstacles','[]'::jsonb,'observations','[]'::jsonb,'provenance',jsonb_build_object('calibrated',true,'accuracyM',0.05,'controlDistances','[{"fromXZ":[0,0],"toXZ":[20,0],"measuredM":20},{"fromXZ":[0,0],"toXZ":[0,15],"measuredM":15}]'::jsonb,'observedAt',now(),'publicSummary','Plan commun rapproché des sources autorisées.','geometrySource','plan_derived','geometryEvidenceIds','["f2670000-0000-4000-8000-000000000001"]'::jsonb)))::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$begin begin perform gp_registry_command(current_setting('gp.qa.common_command')::jsonb);raise exception 'Expected AAL2';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_registry_command(current_setting('gp.qa.common_command')::jsonb);raise exception 'Expected admin';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
do $$declare c jsonb=current_setting('gp.qa.common_command')::jsonb;begin
 begin perform gp_registry_command(jsonb_set(c,'{manifest,spaces}',(c->'manifest'->'spaces')-2));raise exception 'Expected complete floor mapping';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
 begin perform gp_registry_command(jsonb_set(c,'{manifest,spaces,1,footprintXZ}',c->'manifest'->'spaces'->0->'footprintXZ'));raise exception 'Expected overlap refusal';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
 begin perform gp_registry_command(jsonb_set(c,'{manifest,spaces,0,dimensions,widthM}','2.8'));raise exception 'Expected physical dimension check';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
 begin perform gp_registry_command(jsonb_set(c,'{evidenceIds}','["f2670000-0000-4000-8000-000000000009"]'));raise exception 'Expected source check';exception when others then if sqlerrm<>'SCENE_EVIDENCE_REQUIRED' then raise;end if;end;
 begin perform gp_registry_command(c||'{"sellerId":"f2610000-0000-4000-8000-000000000001"}');raise exception 'Expected field refusal';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
end;$$;
select gp_registry_command(current_setting('gp.qa.common_command')::jsonb);
do $$begin begin perform gp_registry_command(current_setting('gp.qa.common_command')::jsonb);raise exception 'Expected version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select 1/(((gp_admin_parking_registry('f2650000-0000-4000-8000-000000000001')->'sites'->0->'levels'->0->>'planVersion')::integer=1)::integer) as admin_floor_version_is_explicit;
reset role;
update parking_scene_sources set created_at=now()-interval '8 days' where id='f2670000-0000-4000-8000-000000000001';
select 1/((not(gp_orphan_scene_source_candidates(100) ? 'f2670000-0000-4000-8000-000000000001'))::integer) as common_plan_evidence_is_not_an_orphan;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('gp.qa.common_public',gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')::text,true);
select 1/((jsonb_array_length(current_setting('gp.qa.common_public')::jsonb->'listings')=2 and jsonb_array_length(current_setting('gp.qa.common_public')::jsonb->'levels')=2)::integer) as all_same_parking_listings_and_levels;
select 1/((jsonb_array_length(current_setting('gp.qa.common_public')::jsonb->'levels'->0->'commonPlan'->'manifest'->'spaces')=2 and current_setting('gp.qa.common_public')::jsonb->'levels'->1->'commonPlan'='null'::jsonb)::integer) as one_explicit_frame_only_no_invented_second_floor;
select 1/((gp_public_parking(null,'f2650000-0000-4000-8000-000000000003') is null)::integer) as area_cannot_open_shared_parking;
select 1/((current_setting('gp.qa.common_public') not like '%f2640000-%' and current_setting('gp.qa.common_public') not like '%f2660000-%' and current_setting('gp.qa.common_public') not like '%f2670000-%' and current_setting('gp.qa.common_public') not like '%PRIVATE-%')::integer) as canonical_ids_sources_and_private_labels_never_public;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.common_command')::jsonb);raise exception 'Expected anon refusal';exception when insufficient_privilege then null;end;end;$$;
reset role;
update parking_scene_sources set processing_state='rejected' where id='f2670000-0000-4000-8000-000000000001';
select 1/((gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')->'levels'->0->'commonPlan'='null'::jsonb)::integer) as missing_ready_source_hides_common_plan;
update parking_scene_sources set processing_state='ready' where id='f2670000-0000-4000-8000-000000000001';
update parking_spaces set dimensions=jsonb_set(dimensions,'{widthM}','2.8') where id='f2640000-0000-4000-8000-000000000001';
select 1/((gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')->'levels'->0->'commonPlan'='null'::jsonb)::integer) as changed_physical_dimensions_hide_stale_plan;
update parking_spaces set dimensions=jsonb_set(dimensions,'{widthM}','2.4') where id='f2640000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_registry_command('{"action":"withdraw_level_plan","levelId":"f2630000-0000-4000-8000-000000000001","version":1,"reason":"Plan retiré pour vérification du repère commun."}');
select 1/((gp_public_parking(null,'f2650000-0000-4000-8000-000000000002')->'levels'->0->'commonPlan'='null'::jsonb)::integer) as withdrawn_plan_is_not_renderable;
reset role;
select 1/((not has_table_privilege('authenticated','public.parking_level_plans','select') and not has_table_privilege('authenticated','public.parking_level_plans','update') and not has_function_privilege('authenticated','public.gp_registry_command_before_common_plans(jsonb)','execute') and not has_function_privilege('anon','public.gp_public_common_plan(uuid,uuid,jsonb)','execute') and not has_function_privilege('authenticated','public.gp_common_plan_geometry(uuid,jsonb)','execute'))::integer) as common_plan_internal_bypasses_closed;
rollback;
