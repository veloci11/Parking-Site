-- 019 isolated RPC/RLS fixtures: no Auth network call, no email, always rollback.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f1910000-0000-4000-8000-000000000001','{"name":"Registry Seller A"}',now()),
('f1910000-0000-4000-8000-000000000002','{"name":"Registry Seller B"}',now()),
('f1910000-0000-4000-8000-000000000003','{"name":"Registry Admin"}',now()),
('f1910000-0000-4000-8000-000000000004','{"name":"Registry Moderator"}',now());
update app_roles set role=case when user_id='f1910000-0000-4000-8000-000000000003' then 'admin' else 'moderator' end where user_id in('f1910000-0000-4000-8000-000000000003','f1910000-0000-4000-8000-000000000004');
-- Intentional rollback-only override: registry AAL2 remains mandatory independently of the global gate.
insert into gp_private.configuration(key,value) values('mfa_required','false') on conflict(key) do update set value=excluded.value;
-- Pending revision fixtures isolate the publication boundary from uploader/document tests.
insert into listings(id,seller_id,draft,lifecycle_state,row_version)
select ('f1920000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
(case when n in(3,4) then 'f1910000-0000-4000-8000-000000000002' else 'f1910000-0000-4000-8000-000000000001' end)::uuid,
jsonb_build_object('id','f1920000-0000-4000-8000-'||lpad(n::text,12,'0'),'slug','registry-qa','title','Place physique de recette','description',repeat('Description factuelle de la place. ',4),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',2000000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f1930000-0000-4000-8000-'||lpad(n::text,12,'0'),'number','','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality','{"floor":"Inconnu","lighting":"Inconnu","humidity":"Inconnu","access":"Inconnu","maneuver":"Inconnu","observations":""}'::jsonb,'locationPrecision',case when n=2 then 'area' else 'exact_opt_in' end,'coordinates','[2.3739,48.8446]'::jsonb,'publicCoordinates','[2.38,48.85]'::jsonb,'address','Adresse annonce approuvée','sceneAvailable',false,'isDemo',false,'status','pending','version',1,'sellerName','QA','createdAt',now(),'updatedAt',now()),'pending',1 from generate_series(1,5)n;
insert into listing_revisions(listing_id,revision_no,payload) select id,1,draft from listings where id::text like 'f1920000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
do $$begin begin perform gp_registry_command('{"action":"create_site","publicName":"Unauthorized site","internalReference":"x"}');raise exception 'Expected MFA';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;end;$$;
select set_config('request.jwt.claims','{"sub":"f1910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select set_config('gp.qa.registry_site',(gp_registry_command('{"action":"create_site","publicName":"Parking partagé QA","internalReference":"REGISTRY-INTERNAL-ONLY","exactAddress":"REGISTRY-PRIVATE-ADDRESS","coordinates":[2.3739,48.8446]}')->>'id'),true);
select set_config('gp.qa.registry_level',(gp_registry_command(jsonb_build_object('action','add_level','siteId',current_setting('gp.qa.registry_site'),'code','SS1','label','Sous-sol','number',-1))->>'id'),true);
select set_config('gp.qa.registry_space1',(gp_registry_command(jsonb_build_object('action','add_space','levelId',current_setting('gp.qa.registry_level'),'number','PRIVATE-CANONICAL-NUMBER','privateLotReference','REGISTRY-PRIVATE-LOT','areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1))->>'id'),true);
select set_config('gp.qa.registry_space2',(gp_registry_command(jsonb_build_object('action','add_space','levelId',current_setting('gp.qa.registry_level'),'number','2','areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1))->>'id'),true);
select set_config('gp.qa.registry_space3',(gp_registry_command(jsonb_build_object('action','add_space','levelId',current_setting('gp.qa.registry_level'),'number','3','areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1))->>'id'),true);
select gp_registry_command(jsonb_build_object('action','set_contributor','siteId',current_setting('gp.qa.registry_site'),'userId','f1910000-0000-4000-8000-000000000002','scope','common_reference'));
select set_config('gp.qa.registry_alias',gp_admin_parking_registry()->'sites'->0->>'publicAlias',true);
do $$begin
 begin perform gp_moderate('f1920000-0000-4000-8000-000000000001','approve',1);raise exception 'Expected missing mapping';exception when others then if sqlerrm<>'REGISTRY_LINK_REQUIRED' then raise;end if;end;
 begin perform gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000001','version',1,'siteId',current_setting('gp.qa.registry_site'),'units','[]'::jsonb,'reason','Rapprochement physique vérifié.'));raise exception 'Expected empty mapping refusal';exception when others then if sqlerrm<>'REGISTRY_INVALID' then raise;end if;end;
end;$$;
reset role;
do $$declare saved jsonb;command jsonb=jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000001','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000001','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié.');begin
 select dimensions into saved from parking_spaces where id=current_setting('gp.qa.registry_space1')::uuid;
 update parking_spaces set dimensions=jsonb_set(dimensions,'{widthM}','2.8') where id=current_setting('gp.qa.registry_space1')::uuid;
 begin perform gp_registry_command(command);raise exception 'Expected dimension mismatch';exception when others then if sqlerrm<>'REGISTRY_INVALID' then raise;end if;end;
 update parking_spaces set dimensions=saved where id=current_setting('gp.qa.registry_space1')::uuid;
 select draft into saved from listings where id='f1920000-0000-4000-8000-000000000001';
 update listings set draft=jsonb_set(draft,'{spaces,0,level}','null') where id='f1920000-0000-4000-8000-000000000001';
 begin perform gp_registry_command(command);raise exception 'Expected unknown level mismatch';exception when others then if sqlerrm<>'REGISTRY_INVALID' then raise;end if;end;
 update listings set draft=saved where id='f1920000-0000-4000-8000-000000000001';
 begin perform gp_registry_command(command||jsonb_build_object('siteId',gen_random_uuid()));raise exception 'Expected site mismatch';exception when others then if sqlerrm<>'REGISTRY_INVALID' then raise;end if;end;
end;$$;
select 1/((select row_version=1 and not exists(select 1 from registry_listing_units where listing_id=listings.id) and not exists(select 1 from published_listings where id=listings.id) from listings where id='f1920000-0000-4000-8000-000000000001')::integer) as failed_mapping_is_atomic;
set local role authenticated;
select gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000001','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000001','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié.'));
do $$begin begin perform gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000001','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000001','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié.'));raise exception 'Expected stale version';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;end;$$;
select gp_moderate('f1920000-0000-4000-8000-000000000001','approve',2);
do $$begin begin perform gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000005','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000005','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié.'));raise exception 'Expected same seller duplicate';exception when others then if sqlerrm<>'REGISTRY_DUPLICATE_SAME_SELLER' then raise;end if;end;end;$$;
select 1/(((gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000003','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000003','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié.'))->>'status')='conflict')::integer) as private_competing_claim;
select gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000002','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000002','spaceId',current_setting('gp.qa.registry_space2'))),'reason','Rapprochement physique vérifié.'));
select gp_moderate('f1920000-0000-4000-8000-000000000002','approve',2);
select gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000004','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000004','spaceId',current_setting('gp.qa.registry_space3'))),'reason','Rapprochement physique vérifié.'));
select gp_moderate('f1920000-0000-4000-8000-000000000004','approve',2);
reset role;
select 1/((select count(*)=1 from registry_conflicts where listing_id='f1920000-0000-4000-8000-000000000003' and status='open')::integer) as conflict_record_private;
select 1/((select count(*)=0 from registry_listing_units where listing_id='f1920000-0000-4000-8000-000000000003')::integer) as conflict_does_not_attach;
select 1/((select count(*)=3 from canonical_space_claims where listing_id::text like 'f1920000-%')::integer) as claims_are_canonical;
select 1/((select count(*)=6 from registry_identity_history where listing_id::text like 'f1920000-%')::integer) as versioned_identity_history;
set local role anon;
select 1/((gp_public_parking(null,'f1920000-0000-4000-8000-000000000002') is null)::integer) as area_has_no_parking_context;
select 1/((gp_public_parking(current_setting('gp.qa.registry_site')::uuid,null) is null)::integer) as physical_uuid_is_not_public_alias;
select 1/((jsonb_array_length(gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)->'listings')=2)::integer) as shared_exact_listings_only;
select 1/((gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)->'levels'->0->'spaces'->0->>'number'='')::integer) as approved_optional_number_not_canonical_number;
select 1/((gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)::text not like '%f1930000-%' and gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)::text not like '%REGISTRY-PRIVATE%' and gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)::text not like '%REGISTRY-INTERNAL%' and gp_public_parking(current_setting('gp.qa.registry_alias')::uuid,null)::text not like '%f1920000-0000-4000-8000-000000000002%')::integer) as public_projection_no_private_or_area;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f1910000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select 1/((jsonb_array_length(gp_my_parking_registry())=1 and not(gp_my_parking_registry()->0 ? 'spaces') and not(gp_my_parking_registry()->0 ? 'exactAddress') and not(gp_my_parking_registry()->0->'levels'->0 ? 'spaces'))::integer) as contributor_only_authorized_commons;
select 1/((select count(*)=0 from listings where id='f1920000-0000-4000-8000-000000000001')::integer) as contributor_no_other_drafts;
do $$begin
 begin perform gp_admin_parking_registry();raise exception 'Expected admin only';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
 begin perform gp_registry_command(jsonb_build_object('action','set_contributor','siteId',current_setting('gp.qa.registry_site'),'userId',auth.uid(),'scope','common_reference'));raise exception 'Expected no contributor escalation';exception when others then if sqlerrm<>'MFA_OR_PERMISSION_REQUIRED' then raise;end if;end;
 begin perform gp_listing('f1920000-0000-4000-8000-000000000001','resume','{}',3);raise exception 'Expected no UUID authorization';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
end;$$;
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f1910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select gp_listing('f1920000-0000-4000-8000-000000000001','pause','{}',3);
reset role;
select 1/((select count(*)=0 from canonical_space_claims where listing_id='f1920000-0000-4000-8000-000000000001')::integer) as pause_releases_claim;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000001',true);
select gp_listing('f1920000-0000-4000-8000-000000000001','resume','{}',4);
reset role;
select 1/((select count(*)=1 from canonical_space_claims where listing_id='f1920000-0000-4000-8000-000000000001')::integer) as resume_reacquires_claim;
-- A competing publication while paused prevents resume and persists only a private dossier.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000001',true);
select gp_listing('f1920000-0000-4000-8000-000000000001','pause','{}',5);
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select gp_registry_command(jsonb_build_object('action','link_listing','listingId','f1920000-0000-4000-8000-000000000003','version',1,'siteId',current_setting('gp.qa.registry_site'),'units',jsonb_build_array(jsonb_build_object('unitId','f1930000-0000-4000-8000-000000000003','spaceId',current_setting('gp.qa.registry_space1'))),'reason','Rapprochement physique vérifié après examen.'));
select gp_moderate('f1920000-0000-4000-8000-000000000003','approve',2);
select set_config('request.jwt.claim.sub','f1910000-0000-4000-8000-000000000001',true);
select 1/((gp_listing('f1920000-0000-4000-8000-000000000001','resume','{}',6)->>'status'='changes_requested')::integer) as competing_resume_requires_review;
reset role;
select 1/((select count(*)=1 from canonical_space_claims where space_id=current_setting('gp.qa.registry_space1')::uuid and listing_id='f1920000-0000-4000-8000-000000000003')::integer) as competing_resume_preserves_owner;
select 1/((select count(*)=1 from registry_conflicts where listing_id='f1920000-0000-4000-8000-000000000001' and status='open')::integer) as competing_resume_private_conflict;
select 1/((not exists(select 1 from published_listings where id='f1920000-0000-4000-8000-000000000001'))::integer) as competing_resume_stays_private;
select 1/((not has_table_privilege('anon','public.parking_sites','select') and not has_table_privilege('authenticated','public.parking_spaces','select') and not has_table_privilege('authenticated','public.registry_conflicts','select') and not has_table_privilege('authenticated','public.registry_identity_history','select') and not has_function_privilege('authenticated','public.gp_listing_before_registry(uuid,text,jsonb,integer)','execute') and not has_function_privilege('authenticated','public.gp_moderate_before_registry(uuid,text,integer,text)','execute') and not has_function_privilege('authenticated','public.gp_registry_publish(uuid)','execute') and not has_function_privilege('anon','public.gp_my_parking_registry()','execute'))::integer) as internal_tables_and_bypasses_closed;
rollback;
