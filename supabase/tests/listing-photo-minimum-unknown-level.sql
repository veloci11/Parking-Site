-- Isolated synthetic data; run after the two 20261023 publication migrations.
-- All users, photos and publications are rolled back. No Auth/network email is sent.
begin;
insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values
('f5310000-0000-4000-8000-000000000001','{"name":"Photo seller QA"}',now()),
('f5310000-0000-4000-8000-000000000002','{"name":"Photo admin QA"}',now());
update app_roles set role='admin' where user_id='f5310000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f5310000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f5310000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $test$
declare n integer; k integer; listing_key uuid; media_key uuid; p jsonb; units jsonb; photos jsonb;
begin
 for n in 0..2 loop
  listing_key=('f5320000-0000-4000-8000-'||lpad((n+1)::text,12,'0'))::uuid;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'number','','level',0,'levelKnown',false,'areaM2',15,'lengthM',null,'widthM',null,'clearanceM',null,'offer',jsonb_build_object('transactionType','sale','priceCents',1500000,'status','available'))) into units from generate_series(1,10);
  p=jsonb_build_object('slug','parking-photo-qa','title','Places avec photos authentiques','description',repeat('Parking couvert avec accès sécurisé. Les numéros et le niveau restent à confirmer. ',3),'city','Pontoise','district','Saint-Martin','type','covered','priceCents',1500000,'transactionType','sale','pricingMode','per_space','spaces',units,'photos','[]'::jsonb,'quality',jsonb_build_object('floor','Inconnu','lighting','Inconnu','humidity','Inconnu','access','Inconnu','maneuver','Inconnu','observations',''),'locationPrecision','area','coordinates','[2.095,49.035]'::jsonb,'publicCoordinates','[2.095,49.035]'::jsonb,'commercialDetails','{"postalCode":"95300","units":{},"access":{"gate":"unknown","door":"unknown","badge":"unknown","key":"unknown","lift":"unknown"},"chargesSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"taxSource":{"year":null,"scope":"","sourceKind":"unknown","sourceDocumentIds":[]},"rentalIncome":null,"photoMetadata":{}}'::jsonb);
  perform gp_listing(listing_key,'create',p,null);
  photos='[]';
  if n>0 then for k in 1..n loop
   media_key=gen_random_uuid();
   insert into media_assets(id,owner_id,listing_id,object_key,mime) values(media_key,auth.uid(),listing_key,auth.uid()||'/'||listing_key||'/'||media_key||'.webp','image/webp');
   photos=photos||jsonb_build_array('/api/media/'||media_key);
  end loop;end if;
  perform gp_listing(listing_key,'update',jsonb_build_object('photos',photos),1);
  perform gp_listing(listing_key,'update',jsonb_build_object('locationConfirmedAt',now()),2);
  if n=0 then
   begin perform gp_listing(listing_key,'submit','{"ownershipAttested":true}',3);raise exception 'Expected missing photo refusal';
   exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
  else perform gp_listing(listing_key,'submit','{"ownershipAttested":true}',3);end if;
 end loop;
end;
$test$;
reset role;
do $test$
declare p jsonb=(select draft from listings where id='f5320000-0000-4000-8000-000000000002'); changed jsonb;
begin
 if gp_registry_mapped('f5320000-0000-4000-8000-000000000002',p)<>'[]'::jsonb then raise exception 'Unknown units must not acquire physical identity';end if;
 changed=jsonb_set(p,'{spaces,0,levelKnown}','true');
 begin perform gp_registry_mapped('f5320000-0000-4000-8000-000000000002',changed);raise exception 'Expected mixed known/unknown mapping refusal';
 exception when others then if sqlerrm<>'REGISTRY_LINK_REQUIRED' then raise;end if;end;
 changed=jsonb_set(p,'{spaces}',(select jsonb_agg(s-'levelKnown') from jsonb_array_elements(p->'spaces')s));
 begin perform gp_registry_mapped('f5320000-0000-4000-8000-000000000002',changed);raise exception 'Expected legacy known mapping requirement';
 exception when others then if sqlerrm<>'REGISTRY_LINK_REQUIRED' then raise;end if;end;
 foreach changed in array array[jsonb_set(p,'{spaces,0,levelKnown}','"false"'),jsonb_set(p,'{spaces,0,levelKnown}','null'),jsonb_set(p,'{spaces,0,level}','-1')] loop
  begin perform gp_validate_offers(changed,true);raise exception 'Expected invalid levelKnown rejection';
  exception when others then if sqlerrm<>'VALIDATION_ERROR' then raise;end if;end;
 end loop;
 begin perform gp_scene_mapping('{"level":0,"spaces":[]}'::jsonb,p,false);raise exception 'Expected unknown-level 3D rejection';
 exception when others then if sqlerrm<>'SCENE_MAPPING_INVALID' then raise;end if;end;
end;
$test$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f5310000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"f5310000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select gp_moderate(('f5320000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approve',4) from generate_series(2,3)n;
reset role;
select 1/((select count(*)=2 and bool_and(jsonb_array_length(payload->'spaces')=10) and bool_and((payload->'spaces'->0->'levelKnown')='false'::jsonb) and bool_and(payload->'spaces'->0->>'number'='') from published_listings where id in ('f5320000-0000-4000-8000-000000000002','f5320000-0000-4000-8000-000000000003'))::int) as one_and_two_photos_publish_ten_unknown_units;
select 1/((select jsonb_array_length(payload->'photos')=1 from published_listings where id='f5320000-0000-4000-8000-000000000002')::int) as one_photo_never_duplicated;
select 1/((select jsonb_array_length(payload->'photos')=2 from published_listings where id='f5320000-0000-4000-8000-000000000003')::int) as two_photos_never_duplicated;
select 1/((select gp_catalog_offer_match(payload,'{"level":0}') is null and gp_catalog_offer_match(payload,'{"level":-1}') is null and gp_catalog_offer_match(payload,'{}') is not null and gp_catalog_offer_match(payload-'pricingMode','{"level":0}') is null from published_listings where id='f5320000-0000-4000-8000-000000000002')::int) as unknown_floor_excluded_from_numeric_filters;
select 1/((not exists(select 1 from registry_published_units where listing_id in ('f5320000-0000-4000-8000-000000000002','f5320000-0000-4000-8000-000000000003')) and not gp_effective_scene_available('f5320000-0000-4000-8000-000000000002'))::int) as no_invented_physical_mapping_or_3d;
select 1/((not has_function_privilege('anon','public.gp_validate_draft_v7(jsonb,uuid,boolean)','execute') and not has_function_privilege('authenticated','public.gp_listing_v11(uuid,text,jsonb,integer)','execute') and not has_function_privilege('authenticated','public.gp_registry_mapped(uuid,jsonb)','execute'))::int) as internal_bypasses_still_closed;
rollback;

