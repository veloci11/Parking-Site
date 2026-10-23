-- 032: controlled canonical parking/geometry fixtures only. No Auth calls, email or asset upload.
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
do $$begin begin perform gp_level_plan_history('f2630000-0000-4000-8000-000000000001');raise exception 'Expected AAL2';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$begin begin perform gp_level_plan_history('f2630000-0000-4000-8000-000000000001');raise exception 'Expected admin';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f2610000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f2610000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_registry_command(current_setting('gp.qa.common_command')::jsonb);
select gp_registry_command(jsonb_set(jsonb_set(current_setting('gp.qa.common_command')::jsonb,'{version}','1'),'{manifest,provenance,publicSummary}','"Version deux du repère commun, contrôlée séparément."'));
select gp_registry_command('{"action":"withdraw_level_plan","levelId":"f2630000-0000-4000-8000-000000000001","version":2,"reason":"Retrait contrôlé avant restauration de recette."}');
select set_config('gp.qa.restore_command','{"action":"restore_level_plan","levelId":"f2630000-0000-4000-8000-000000000001","version":3,"sourceVersion":1,"rightsAttested":true,"checks":{"coordinateFrameConfirmed":true,"mappingChecked":true,"sourcesChecked":true},"reason":"Restauration vérifiée avec sources et autorisations actuelles."}',true);
do $$declare c jsonb=current_setting('gp.qa.restore_command')::jsonb;begin
 begin perform gp_registry_command(c||'{"version":2}');raise exception 'Expected stale version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 begin perform gp_registry_command(c||'{"sourceVersion":3}');raise exception 'Expected published revision';exception when others then if sqlerrm<>'PLAN_REVISION_INVALID' then raise;end if;end;
 begin perform gp_registry_command(c||'{"sourceVersion":999}');raise exception 'Expected missing revision';exception when others then if sqlerrm<>'PLAN_REVISION_INVALID' then raise;end if;end;
 begin perform gp_registry_command(c||'{"rightsAttested":false}');raise exception 'Expected rights';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
 begin perform gp_registry_command(c||'{"manifest":{}}');raise exception 'Expected no supplied replacement';exception when others then if sqlerrm<>'COMMON_PLAN_INVALID' then raise;end if;end;
end;$$;
reset role;
select 1/((not(gp_orphan_scene_source_candidates(100) ? 'f2670000-0000-4000-8000-000000000001'))::integer) as withdrawn_history_retains_sources;
do $$begin
 begin update gp_private.parking_level_plan_revisions set reason='tampered';raise exception 'Expected immutable update';exception when others then if sqlerrm<>'PLAN_HISTORY_IMMUTABLE' then raise;end if;end;
 begin delete from gp_private.parking_level_plan_revisions;raise exception 'Expected immutable delete';exception when others then if sqlerrm<>'PLAN_HISTORY_IMMUTABLE' then raise;end if;end;
end;$$;
update parking_scene_sources set sha256=repeat('b',64) where id='f2670000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);raise exception 'Expected source hash mismatch';exception when others then if sqlerrm<>'PLAN_HISTORY_STALE' then raise;end if;end;end;$$;
reset role;
update parking_scene_sources set sha256=repeat('a',64),processing_state='rejected' where id='f2670000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);raise exception 'Expected nonready source';exception when others then if sqlerrm<>'SCENE_EVIDENCE_REQUIRED' then raise;end if;end;end;$$;
reset role;
update parking_scene_sources set processing_state='ready' where id='f2670000-0000-4000-8000-000000000001';
update parking_spaces set dimensions=jsonb_set(dimensions,'{widthM}','2.8') where id='f2640000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);raise exception 'Expected current mapping check';exception when others then if sqlerrm<>'PLAN_HISTORY_STALE' then raise;end if;end;end;$$;
reset role;
update parking_spaces set dimensions=jsonb_set(dimensions,'{widthM}','2.4') where id='f2640000-0000-4000-8000-000000000001';
update published_listings set payload=jsonb_set(payload,'{locationPrecision}','"area"') where id::text like 'f2650000-%';
set local role authenticated;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);raise exception 'Expected current exact consent';exception when others then if sqlerrm<>'COMMON_PLAN_CONSENT_REQUIRED' then raise;end if;end;end;$$;
reset role;
update published_listings p set payload=gp_public_payload(l.draft) from listings l where l.id=p.id and p.id::text like 'f2650000-%';
update account_statuses set status='suspended' where user_id='f2610000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin begin perform gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);raise exception 'Expected active source owner';exception when others then if sqlerrm<>'SCENE_EVIDENCE_REQUIRED' then raise;end if;end;end;$$;
reset role;
update account_statuses set status='active' where user_id='f2610000-0000-4000-8000-000000000001';
select 1/(((select count(*) from gp_private.parking_level_plan_revisions where level_id='f2630000-0000-4000-8000-000000000001')=3)::integer) as failed_restore_never_creates_revision;
-- Withdraw a different listing; restoring geometry must not reactivate its links or offer.
update listings set lifecycle_state='withdrawn' where id='f2650000-0000-4000-8000-000000000002';
delete from published_listings where id='f2650000-0000-4000-8000-000000000002';
set local role authenticated;
select gp_registry_command(current_setting('gp.qa.restore_command')::jsonb);
select 1/(((gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->'items'->0->>'version')::int=4 and gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->'items'->0->>'action'='restore_level_plan' and (gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->'items'->0->>'restoredFromVersion')::int=1)::integer) as restore_creates_new_version;
select 1/((gp_level_plan_history('f2630000-0000-4000-8000-000000000001')::text not like '%f2640000-%' and gp_level_plan_history('f2630000-0000-4000-8000-000000000001')::text not like '%f2670000-%' and not(gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->'items'->0 ? 'manifest'))::integer) as history_summary_omits_private_geometry_and_sources;
do $$declare v integer;begin for v in 4..30 loop perform gp_registry_command(jsonb_set(current_setting('gp.qa.common_command')::jsonb,'{version}',to_jsonb(v)));end loop;end;$$;
select 1/((jsonb_array_length(gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->'items')=25 and (gp_level_plan_history('f2630000-0000-4000-8000-000000000001')->>'nextBeforeVersion')::int=7 and jsonb_array_length(gp_level_plan_history('f2630000-0000-4000-8000-000000000001',7)->'items')=6)::integer) as history_is_bounded_and_cursor_stable;
reset role;
select 1/(((select lifecycle_state from listings where id='f2650000-0000-4000-8000-000000000002')='withdrawn' and not exists(select 1 from registry_published_units where listing_id='f2650000-0000-4000-8000-000000000002'))::integer) as restore_never_resurrects_withdrawn_listing;
select 1/(((select manifest from parking_level_plans where level_id='f2630000-0000-4000-8000-000000000001')=(select manifest from gp_private.parking_level_plan_revisions where level_id='f2630000-0000-4000-8000-000000000001' and row_version=1))::integer) as original_manifest_retained_exactly;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select 1/((gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')::text not like '%f2640000-%' and gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')::text not like '%f2670000-%' and gp_public_parking(null,'f2650000-0000-4000-8000-000000000001')::text not like '%PRIVATE-%')::integer) as restored_public_plan_omits_private_ids;
do $$begin begin perform gp_level_plan_history('f2630000-0000-4000-8000-000000000001');raise exception 'Expected anonymous history refusal';exception when insufficient_privilege then null;end;end;$$;
reset role;
select 1/((not has_table_privilege('authenticated','gp_private.parking_level_plan_revisions','select') and not has_table_privilege('service_role','gp_private.parking_level_plan_revisions','update') and not has_function_privilege('authenticated','public.gp_registry_command_before_plan_history(jsonb)','execute') and not has_function_privilege('anon','public.gp_level_plan_history(uuid,integer)','execute') and not has_function_privilege('authenticated','gp_private.gp_level_plan_evidence(uuid[])','execute'))::integer) as plan_history_contract_closed;
rollback;
