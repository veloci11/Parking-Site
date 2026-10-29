-- Destructive only within this rollback transaction. Use a dedicated development project.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
 ('f1000000-0000-4000-8000-000000000001','{"name":"Acheteur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000002','{"name":"Vendeur Test"}',now()),
 ('f1000000-0000-4000-8000-000000000003','{"name":"Moderateur Test"}',now());
update public.app_roles set role='moderator' where user_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select public.gp_listing('f2000000-0000-4000-8000-000000000001','create',jsonb_build_object(
'id','fake','slug','paris-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Paris','district','Test','commercialDetails','{"postalCode":"75012","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb,'priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[2.3739,48.8446]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"],"spacePhotos":{"f3000000-0000-4000-8000-000000000001":["/api/media/f4000000-0000-4000-8000-000000000004"]}}',1);

reset role;
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at) values('fd100000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','private-commercial-plan.pdf','application/pdf',100,repeat('a',64),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select gp_listing('f2000000-0000-4000-8000-000000000001','update',jsonb_build_object('type','mixed','publicCoordinates','[2.38,48.85]'::jsonb,'spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1),jsonb_build_object('id','f3000000-0000-4000-8000-000000000002','number',repeat('A',40),'level',0,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',null)),'commercialDetails',jsonb_build_object('postalCode','75012','units',jsonb_build_object('f3000000-0000-4000-8000-000000000001',jsonb_build_object('type','covered','levelLabel','Sous-sol','privateLotReference','LOT-SECRET-ABC','dimensionSource','plan_derived','dimensionObservedAt',null,'sourceDocumentIds','["fd100000-0000-4000-8000-000000000001"]'::jsonb,'limitingPoint','Poteau latéral'),'f3000000-0000-4000-8000-000000000002',jsonb_build_object('type','outdoor','levelLabel','Rez-de-chaussée','privateLotReference','LOT-SECRET-DEF','dimensionSource','unknown','dimensionObservedAt',null,'sourceDocumentIds','[]'::jsonb,'limitingPoint','Non renseigné')),'access','{"gate":"present","door":"unknown","badge":"present","key":"unknown","lift":"absent"}'::jsonb,'chargesSource','{"year":2025,"scope":"Lot entier","sourceKind":"seller_declared","sourceDocumentIds":[]}'::jsonb,'taxSource','{"year":2025,"scope":"Lot entier","sourceKind":"provided_document","sourceDocumentIds":["fd100000-0000-4000-8000-000000000001"]}'::jsonb,'rentalIncome','{"amountCents":10000,"period":"month","observedAt":null,"sourceKind":"seller_declared","sourceDocumentIds":[]}'::jsonb,'photoMetadata','{"f4000000-0000-4000-8000-000000000001":{"caption":"Photo du lot","takenAt":null}}'::jsonb)),2);
select 1/((select draft->>'locationConfirmedAt' is null from listings where id='f2000000-0000-4000-8000-000000000001')::integer) as point_change_requires_confirmation;
select 1/((gp_listing_preview('f2000000-0000-4000-8000-000000000001')->'coordinates'='[2.38,48.85]'::jsonb and not(gp_listing_preview('f2000000-0000-4000-8000-000000000001')?'address') and gp_listing_preview('f2000000-0000-4000-8000-000000000001')::text not like '%LOT-SECRET%' and gp_listing_preview('f2000000-0000-4000-8000-000000000001')::text not like '%fd100000-0000-4000-8000-000000000001%')::integer) as preview_aliases_and_private_stripping;
do $$begin begin perform gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',3);raise exception 'Expected confirmation requirement';exception when others then if sqlerrm<>'LOCATION_CONFIRMATION_REQUIRED' then raise;end if;end;end;$$;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"locationConfirmedAt":"2000-01-01T00:00:00Z"}',3);
select 1/((select (draft->>'locationConfirmedAt')::timestamptz>now()-interval '10 seconds' and location_confirmation_hash is not null from listings where id='f2000000-0000-4000-8000-000000000001')::integer) as confirmation_server_time;
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',4);
select 1/((select draft->'spaces'->0->>'number'='' and length(draft->'spaces'->1->>'number')=40 from listings where id='f2000000-0000-4000-8000-000000000001')::integer) as optional_public_numbers_preserved;
select 1/((select payload->'spaces'->0->>'number'='' from listing_revisions where listing_id='f2000000-0000-4000-8000-000000000001' and revision_no=5)::integer) as no_legacy_placeholder_in_revision;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
-- 019 fixture prerequisites for the unrelated publication-rule assertions below.
reset role;
insert into parking_sites(id,public_name,internal_reference) values('f1690000-0000-4000-8000-000000000001','Parking QA','Fixture historique');
insert into parking_levels(id,site_id,code,label,number,sort_order)
select gen_random_uuid(),'f1690000-0000-4000-8000-000000000001',value->>'level','Niveau QA',(value->>'level')::integer,(value->>'level')::integer from listings cross join lateral jsonb_array_elements(draft->'spaces') where listings.id='f2000000-0000-4000-8000-000000000001' group by value->>'level';
insert into parking_spaces(id,level_id,number,dimensions)
select (u.value->>'id')::uuid,l.id,u.value->>'number',jsonb_build_object('areaM2',u.value->'areaM2','lengthM',u.value->'lengthM','widthM',u.value->'widthM','clearanceM',u.value->'clearanceM') from listings cross join lateral jsonb_array_elements(draft->'spaces')u join parking_levels l on l.site_id='f1690000-0000-4000-8000-000000000001' and l.number=(u.value->>'level')::integer where listings.id='f2000000-0000-4000-8000-000000000001';
insert into registry_listing_units(listing_id,unit_id,space_id,signature) select listings.id,(u.value->>'id')::uuid,(u.value->>'id')::uuid,md5((draft->'spaces')::text) from listings cross join lateral jsonb_array_elements(draft->'spaces')u where listings.id='f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select gp_moderate('f2000000-0000-4000-8000-000000000001','approve',5,null);
set local role anon;
select 1/(((gp_catalog_page_v2('{"ids":["f2000000-0000-4000-8000-000000000001"],"type":"covered"}',null,1)->>'total')::integer=1)::integer) as mixed_any_unit_type;
select 1/(((gp_catalog_page_v2('{"ids":["f2000000-0000-4000-8000-000000000001"],"covered":true}',null,1)->>'total')::integer=0)::integer) as mixed_all_units_covered_required;
select 1/(((gp_catalog_page_v2('{"ids":["f2000000-0000-4000-8000-000000000001"],"covered":false,"closed":false}',null,1)->>'total')::integer=1)::integer) as mixed_public_filter_before_limit;
select 1/(((gp_catalog_page_v2('{"ids":["f2000000-0000-4000-8000-000000000001"],"center":[2.38,48.85],"radiusKm":0.1}',null,1)->>'total')::integer=1)::integer) as spatial_uses_confirmed_public_point;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$begin begin perform gp_listing_preview('f2000000-0000-4000-8000-000000000001');raise exception 'Expected owner-only preview';exception when others then if sqlerrm<>'NOT_FOUND' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"city":"Nouvelle ville","locationConfirmedAt":"2000-01-01T00:00:00Z"}',6);
select 1/((select draft->>'locationConfirmedAt' is null and location_confirmation_hash is null from listings where id='f2000000-0000-4000-8000-000000000001')::integer) as address_change_clears_stale_checkbox;
reset role;
select 1/((not has_function_privilege('authenticated','public.gp_listing_before_commercial(uuid,text,jsonb,integer)','execute') and not has_function_privilege('anon','public.gp_listing_preview(uuid)','execute'))::integer) as commercial_internals_closed;
rollback;
