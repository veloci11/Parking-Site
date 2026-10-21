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
'id','fake','slug','lyon-test','title','Place privée de test','description',repeat('Description documentée de la place et de ses contraintes. ',3),'city','Lyon','district','Test','priceCents',1800000,'type','covered','spaces',jsonb_build_array(jsonb_build_object('id','f3000000-0000-4000-8000-000000000001','number','12','level',-1,'areaM2',12,'lengthM',5,'widthM',2.4,'clearanceM',2.1)),'photos','[]'::jsonb,'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations','Aucune expertise'),'locationPrecision','area','coordinates','[4.8597,45.7612]'::jsonb,'address','Adresse privée','sceneAvailable',true,'isDemo',true,'status','published','version',999,'sellerName','Usurpation','createdAt',now(),'updatedAt',now()),null);
select 1/((select draft->>'sellerName'='Vendeur Test' and draft->>'isDemo'='false' and draft->>'status'='draft' and draft->>'id'=id::text from listings where id='f2000000-0000-4000-8000-000000000001')::int) as forced_metadata;
insert into media_assets(id,owner_id,listing_id,object_key,mime) select id,'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002/f2000000-0000-4000-8000-000000000001/'||id||'.webp','image/webp' from unnest(array['f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004']::uuid[])id;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"photos":["/api/media/f4000000-0000-4000-8000-000000000001","/api/media/f4000000-0000-4000-8000-000000000002","/api/media/f4000000-0000-4000-8000-000000000003"],"spacePhotos":{"f3000000-0000-4000-8000-000000000001":["/api/media/f4000000-0000-4000-8000-000000000004"]}}',1);

reset role;
insert into parking_scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at) values('fd000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','private-plan.pdf','application/pdf',100,repeat('a',64),now()-interval '8 days');
-- 016 prerequisite: these tests exercise evidence, with a confirmed location fixture.
update listings set draft=draft||jsonb_build_object('locationConfirmedAt',now()),location_confirmation_hash=gp_location_hash(draft) where id='f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform gp_listing('f2000000-0000-4000-8000-000000000001','update','{"conditionObservations":[{"id":"fe000000-0000-4000-8000-000000000001","spaceId":null,"category":"floor","value":"Fissure","comment":"","sourceKind":"seller_declared","observedAt":null,"evidenceMediaIds":[],"observerId":"f1000000-0000-4000-8000-000000000003"}]}',2);raise exception 'Expected spoof refusal';exception when others then if sqlerrm<>'CONDITION_INVALID' then raise;end if;end;
 begin perform gp_listing('f2000000-0000-4000-8000-000000000001','update','{"conditionObservations":[{"id":"fe000000-0000-4000-8000-000000000001","spaceId":"f3000000-0000-4000-8000-000000000001","category":"floor","value":"Fissure","comment":"","sourceKind":"photo_documented","observedAt":null,"evidenceMediaIds":["f4000000-0000-4000-8000-000000000001"]}]}',2);raise exception 'Expected unit photo scope refusal';exception when others then if sqlerrm<>'CONDITION_MEDIA_NOT_OWNED' then raise;end if;end;
 end;$$;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"conditionObservations":[{"id":"fe000000-0000-4000-8000-000000000001","spaceId":null,"category":"floor","value":"Fissure","comment":"","sourceKind":"photo_documented","observedAt":null,"evidenceMediaIds":[]}]}',2);
do $$begin begin perform gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',3);raise exception 'Expected submit evidence requirement';exception when others then if sqlerrm<>'CONDITION_EVIDENCE_REQUIRED' then raise;end if;end;end;$$;
select gp_listing('f2000000-0000-4000-8000-000000000001','update','{"conditionObservations":[{"id":"fe000000-0000-4000-8000-000000000001","spaceId":null,"category":"floor","value":"Fissure observée","comment":"À vérifier sur place","sourceKind":"photo_documented","observedAt":"2026-01-01T00:00:00Z","evidenceMediaIds":["f4000000-0000-4000-8000-000000000001"]},{"id":"fe000000-0000-4000-8000-000000000002","spaceId":"f3000000-0000-4000-8000-000000000001","category":"clearance_access","value":"Hauteur lue sur plan","comment":"Déclaration vendeur","sourceKind":"plan_derived","observedAt":null,"evidenceMediaIds":[],"sourceDocumentIds":["fd000000-0000-4000-8000-000000000001"]}]}',3);
select 1/((select draft->'conditionObservations'->0->>'observerId'='f1000000-0000-4000-8000-000000000002' and draft->'conditionObservations'->1->>'confidenceScope'='unit_declared' from listings where id='f2000000-0000-4000-8000-000000000001')::integer) as attribution_server_only;
select gp_listing('f2000000-0000-4000-8000-000000000001','submit','{"ownershipAttested":true}',4);
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
select 1/((select jsonb_array_length(payload->'conditionObservations')=2 and payload->'conditionObservations'->0->>'id'='f2000000-0000-4000-8000-000000000001:observation:1' and payload->'conditionObservations'->1->>'spaceId'='f2000000-0000-4000-8000-000000000001:unit:1' and not(payload->'conditionObservations'->0 ? 'observerId') and not(payload->'conditionObservations'->1 ? 'sourceDocumentIds') from published_listings where id='f2000000-0000-4000-8000-000000000001')::integer) as public_aliases_no_private_attribution;
reset role;
select 1/((not(gp_orphan_scene_source_candidates(100) ? 'fd000000-0000-4000-8000-000000000001'))::integer) as observation_source_never_orphan;
select 1/((not has_function_privilege('authenticated','public.gp_attribute_conditions(jsonb,jsonb,uuid,jsonb,boolean)','execute') and not has_function_privilege('authenticated','public.gp_listing_before_conditions(uuid,text,jsonb,integer)','execute'))::integer) as condition_internals_closed;
rollback;
